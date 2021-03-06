

/**
 * Add any control elements for the table - specifically scrolling
 *  @param {object} oSettings dataTables settings object
 *  @returns {node} Node to add to the DOM
 *  @memberof DataTable#oApi
 */
function _fnFeatureHtmlTable ( oSettings )
{
    /* Check if scrolling is enabled or not - if not then leave the DOM unaltered */
    if ( oSettings.oScroll.sX === "" && oSettings.oScroll.sY === "" )
    {
        return oSettings.nTable;
    }

    /*
     * The HTML structure that we want to generate in this function is:
     *  div - nScroller
     *    div - nScrollHead
     *      div - nScrollHeadInner
     *        table - nScrollHeadTable
     *          thead - nThead
     *    div - nScrollBody
     *      table - oSettings.nTable
     *        thead - nTheadSize
     *        tbody - nTbody
     *    div - nScrollFoot
     *      div - nScrollFootInner
     *        table - nScrollFootTable
     *          tfoot - nTfoot
     */
    var
         nScroller = document.createElement('div'),
         nScrollHead = document.createElement('div'),
         nScrollHeadInner = document.createElement('div'),
         nScrollBody = document.createElement('div'),
         nScrollFoot = document.createElement('div'),
         nScrollFootInner = document.createElement('div'),
         nScrollHeadTable = oSettings.nTable.cloneNode(false),
         nScrollFootTable = oSettings.nTable.cloneNode(false),
        nThead = oSettings.nTable.getElementsByTagName('thead')[0],
         nTfoot = oSettings.nTable.getElementsByTagName('tfoot').length === 0 ? null :
            oSettings.nTable.getElementsByTagName('tfoot')[0],
        oClasses = oSettings.oClasses;

    nScrollHead.appendChild( nScrollHeadInner );
    nScrollFoot.appendChild( nScrollFootInner );
    nScrollBody.appendChild( oSettings.nTable );
    nScroller.appendChild( nScrollHead );
    nScroller.appendChild( nScrollBody );
    nScrollHeadInner.appendChild( nScrollHeadTable );
    nScrollHeadTable.appendChild( nThead );
    if ( nTfoot !== null )
    {
        nScroller.appendChild( nScrollFoot );
        nScrollFootInner.appendChild( nScrollFootTable );
        nScrollFootTable.appendChild( nTfoot );
    }

    nScroller.className = oClasses.sScrollWrapper;
    nScrollHead.className = oClasses.sScrollHead;
    nScrollHeadInner.className = oClasses.sScrollHeadInner;
    nScrollBody.className = oClasses.sScrollBody;
    nScrollFoot.className = oClasses.sScrollFoot;
    nScrollFootInner.className = oClasses.sScrollFootInner;

    if ( oSettings.oScroll.bAutoCss )
    {
        nScrollHead.style.overflow = "hidden";
        nScrollHead.style.position = "relative";
        nScrollFoot.style.overflow = "hidden";
        nScrollBody.style.overflow = "auto";
    }

    nScrollHead.style.border = "0";
    nScrollHead.style.width = "100%";
    nScrollFoot.style.border = "0";
    nScrollHeadInner.style.width = "150%"; /* will be overwritten */

    /* Modify attributes to respect the clones */
    nScrollHeadTable.removeAttribute('id');
    nScrollHeadTable.style.marginLeft = "0";
    oSettings.nTable.style.marginLeft = "0";
    if ( nTfoot !== null )
    {
        nScrollFootTable.removeAttribute('id');
        nScrollFootTable.style.marginLeft = "0";
    }

    /* Move any caption elements from the body to the header */
    var nCaptions = $(oSettings.nTable).children('caption');
    for ( var i=0, iLen=nCaptions.length ; i<iLen ; i++ )
    {
        nScrollHeadTable.appendChild( nCaptions[i] );
    }

    /*
     * Sizing
     */
    /* When xscrolling add the width and a scroller to move the header with the body */
    if ( oSettings.oScroll.sX !== "" )
    {
        nScrollHead.style.width = _fnStringToCss( oSettings.oScroll.sX );
        nScrollBody.style.width = _fnStringToCss( oSettings.oScroll.sX );

        if ( nTfoot !== null )
        {
            nScrollFoot.style.width = _fnStringToCss( oSettings.oScroll.sX );
        }

        /* When the body is scrolled, then we also want to scroll the headers */
        $(nScrollBody).scroll( function (e) {
            nScrollHead.scrollLeft = this.scrollLeft;

            if ( nTfoot !== null )
            {
                nScrollFoot.scrollLeft = this.scrollLeft;
            }
        } );
    }

    /* When yscrolling, add the height */
    if ( oSettings.oScroll.sY !== "" )
    {
        nScrollBody.style.height = _fnStringToCss( oSettings.oScroll.sY );
    }

    /* Redraw - align columns across the tables */
    oSettings.aoDrawCallback.push( {
        "fn": _fnScrollDraw,
        "sName": "scrolling"
    } );

    /* Infinite scrolling event handlers */
    if ( oSettings.oScroll.bInfinite )
    {
        $(nScrollBody).scroll( function() {
            /* Use a blocker to stop scrolling from loading more data while other data is still loading */
            if ( !oSettings.bDrawing && $(this).scrollTop() !== 0 )
            {
                /* Check if we should load the next data set */
                if ( $(this).scrollTop() + $(this).height() >
                    $(oSettings.nTable).height() - oSettings.oScroll.iLoadGap )
                {
                    /* Only do the redraw if we have to - we might be at the end of the data */
                    if ( oSettings.fnDisplayEnd() < oSettings.fnRecordsDisplay() )
                    {
                        _fnPageChange( oSettings, 'next' );
                        _fnCalculateEnd( oSettings );
                        _fnDraw( oSettings );
                    }
                }
            }
        } );
    }

    oSettings.nScrollHead = nScrollHead;
    oSettings.nScrollFoot = nScrollFoot;

    return nScroller;
}


/**
 * Update the various tables for resizing. It's a bit of a pig this function, but
 * basically the idea to:
 *   1. Re-create the table inside the scrolling div
 *   2. Take live measurements from the DOM
 *   3. Apply the measurements
 *   4. Clean up
 *  @param {object} o dataTables settings object
 *  @returns {node} Node to add to the DOM
 *  @memberof DataTable#oApi
 */
function _fnScrollDraw ( o )
{
    var
        nScrollHeadInner = o.nScrollHead.getElementsByTagName('div')[0],
        nScrollHeadTable = nScrollHeadInner.getElementsByTagName('table')[0],
        nScrollBody = o.nTable.parentNode,
        i, iLen, j, jLen, anHeadToSize, anHeadSizers, anFootSizers, anFootToSize, oStyle, iVis,
        iWidth, aApplied=[], iSanityWidth,
        nScrollFootInner = (o.nTFoot !== null) ? o.nScrollFoot.getElementsByTagName('div')[0] : null,
        nScrollFootTable = (o.nTFoot !== null) ? nScrollFootInner.getElementsByTagName('table')[0] : null,
        ie67 = $.browser.msie && $.browser.version <= 7;

    /*
     * 1. Re-create the table inside the scrolling div
     */

    /* Remove the old minimised thead and tfoot elements in the inner table */
    var nTheadSize = o.nTable.getElementsByTagName('thead');
    if ( nTheadSize.length > 0 )
    {
        o.nTable.removeChild( nTheadSize[0] );
    }

    var nTfootSize;
    if ( o.nTFoot !== null )
    {
        /* Remove the old minimised footer element in the cloned header */
        nTfootSize = o.nTable.getElementsByTagName('tfoot');
        if ( nTfootSize.length > 0 )
        {
            o.nTable.removeChild( nTfootSize[0] );
        }
    }

    /* Clone the current header and footer elements and then place it into the inner table */
    nTheadSize = o.nTHead.cloneNode(true);
    o.nTable.insertBefore( nTheadSize, o.nTable.childNodes[0] );

    if ( o.nTFoot !== null )
    {
        nTfootSize = o.nTFoot.cloneNode(true);
        o.nTable.insertBefore( nTfootSize, o.nTable.childNodes[1] );
    }

    /*
     * 2. Take live measurements from the DOM - do not alter the DOM itself!
     */

    /* Remove old sizing and apply the calculated column widths
     * Get the unique column headers in the newly created (cloned) header. We want to apply the
     * calclated sizes to this header
     */
    if ( o.oScroll.sX === "" )
    {
        nScrollBody.style.width = '100%';
        nScrollHeadInner.parentNode.style.width = '100%';
    }

    var nThs = _fnGetUniqueThs( o, nTheadSize );
    for ( i=0, iLen=nThs.length ; i<iLen ; i++ )
    {
        iVis = _fnVisibleToColumnIndex( o, i );
        nThs[i].style.width = o.aoColumns[iVis].sWidth;
    }

    if ( o.nTFoot !== null )
    {
        _fnApplyToChildren( function(n) {
            n.style.width = "";
        }, nTfootSize.getElementsByTagName('tr') );
    }

    /* Size the table as a whole */
    iSanityWidth = $(o.nTable).outerWidth();
    if ( o.oScroll.sX === "" )
    {
        /* No x scrolling */
        o.nTable.style.width = "100%";

        /* I know this is rubbish - but IE7 will make the width of the table when 100% include
         * the scrollbar - which is shouldn't. When there is a scrollbar we need to take this
         * into account.
         */
        if ( ie67 && ($('tbody', nScrollBody).height() > nScrollBody.offsetHeight ||
            $(nScrollBody).css('overflow-y') == "scroll")  )
        {
            o.nTable.style.width = _fnStringToCss( $(o.nTable).outerWidth()-o.oScroll.iBarWidth );
        }
    }
    else
    {
        if ( o.oScroll.sXInner !== "" )
        {
            /* x scroll inner has been given - use it */
            o.nTable.style.width = _fnStringToCss(o.oScroll.sXInner);
        }
        else if ( iSanityWidth == $(nScrollBody).width() &&
           $(nScrollBody).height() < $(o.nTable).height() )
        {
            /* There is y-scrolling - try to take account of the y scroll bar */
            o.nTable.style.width = _fnStringToCss( iSanityWidth-o.oScroll.iBarWidth );
            if ( $(o.nTable).outerWidth() > iSanityWidth-o.oScroll.iBarWidth )
            {
                /* Not possible to take account of it */
                o.nTable.style.width = _fnStringToCss( iSanityWidth );
            }
        }
        else
        {
            /* All else fails */
            o.nTable.style.width = _fnStringToCss( iSanityWidth );
        }
    }

    /* Recalculate the sanity width - now that we've applied the required width, before it was
     * a temporary variable. This is required because the column width calculation is done
     * before this table DOM is created.
     */
    iSanityWidth = $(o.nTable).outerWidth();

    /* We want the hidden header to have zero height, so remove padding and borders. Then
     * set the width based on the real headers
     */
    anHeadToSize = o.nTHead.getElementsByTagName('tr');
    anHeadSizers = nTheadSize.getElementsByTagName('tr');

    _fnApplyToChildren( function(nSizer, nToSize) {
        oStyle = nSizer.style;
        oStyle.paddingTop = "0";
        oStyle.paddingBottom = "0";
        oStyle.borderTopWidth = "0";
        oStyle.borderBottomWidth = "0";
        oStyle.height = 0;

        iWidth = $(nSizer).width();
        nToSize.style.width = _fnStringToCss( iWidth );
        aApplied.push( iWidth );
    }, anHeadSizers, anHeadToSize );
    $(anHeadSizers).height(0);

    if ( o.nTFoot !== null )
    {
        /* Clone the current footer and then place it into the body table as a "hidden header" */
        anFootSizers = nTfootSize.getElementsByTagName('tr');
        anFootToSize = o.nTFoot.getElementsByTagName('tr');

        _fnApplyToChildren( function(nSizer, nToSize) {
            oStyle = nSizer.style;
            oStyle.paddingTop = "0";
            oStyle.paddingBottom = "0";
            oStyle.borderTopWidth = "0";
            oStyle.borderBottomWidth = "0";
            oStyle.height = 0;

            iWidth = $(nSizer).width();
            nToSize.style.width = _fnStringToCss( iWidth );
            aApplied.push( iWidth );
        }, anFootSizers, anFootToSize );
        $(anFootSizers).height(0);
    }

    /*
     * 3. Apply the measurements
     */

    /* "Hide" the header and footer that we used for the sizing. We want to also fix their width
     * to what they currently are
     */
    _fnApplyToChildren( function(nSizer) {
        nSizer.innerHTML = "";
        nSizer.style.width = _fnStringToCss( aApplied.shift() );
    }, anHeadSizers );

    if ( o.nTFoot !== null )
    {
        _fnApplyToChildren( function(nSizer) {
            nSizer.innerHTML = "";
            nSizer.style.width = _fnStringToCss( aApplied.shift() );
        }, anFootSizers );
    }

    /* Sanity check that the table is of a sensible width. If not then we are going to get
     * misalignment - try to prevent this by not allowing the table to shrink below its min width
     */
    if ( $(o.nTable).outerWidth() < iSanityWidth )
    {
        /* The min width depends upon if we have a vertical scrollbar visible or not */
        var iCorrection = ((nScrollBody.scrollHeight > nScrollBody.offsetHeight ||
            $(nScrollBody).css('overflow-y') == "scroll")) ?
                iSanityWidth+o.oScroll.iBarWidth : iSanityWidth;

        /* IE6/7 are a law unto themselves... */
        if ( ie67 && (nScrollBody.scrollHeight >
            nScrollBody.offsetHeight || $(nScrollBody).css('overflow-y') == "scroll")  )
        {
            o.nTable.style.width = _fnStringToCss( iCorrection-o.oScroll.iBarWidth );
        }

        /* Apply the calculated minimum width to the table wrappers */
        nScrollBody.style.width = _fnStringToCss( iCorrection );
        nScrollHeadInner.parentNode.style.width = _fnStringToCss( iCorrection );

        if ( o.nTFoot !== null )
        {
            nScrollFootInner.parentNode.style.width = _fnStringToCss( iCorrection );
        }

        /* And give the user a warning that we've stopped the table getting too small */
        if ( o.oScroll.sX === "" )
        {
            _fnLog( o, 1, "The table cannot fit into the current element which will cause column"+
                " misalignment. The table has been drawn at its minimum possible width." );
        }
        else if ( o.oScroll.sXInner !== "" )
        {
            _fnLog( o, 1, "The table cannot fit into the current element which will cause column"+
                " misalignment. Increase the sScrollXInner value or remove it to allow automatic"+
                " calculation" );
        }
    }
    else
    {
        nScrollBody.style.width = _fnStringToCss( '100%' );
        nScrollHeadInner.parentNode.style.width = _fnStringToCss( '100%' );

        if ( o.nTFoot !== null )
        {
            nScrollFootInner.parentNode.style.width = _fnStringToCss( '100%' );
        }
    }


    /*
     * 4. Clean up
     */
    if ( o.oScroll.sY === "" )
    {
        /* IE7< puts a vertical scrollbar in place (when it shouldn't be) due to subtracting
         * the scrollbar height from the visible display, rather than adding it on. We need to
         * set the height in order to sort this. Don't want to do it in any other browsers.
         */
        if ( ie67 )
        {
            nScrollBody.style.height = _fnStringToCss( o.nTable.offsetHeight+o.oScroll.iBarWidth );
        }
    }

    if ( o.oScroll.sY !== "" && o.oScroll.bCollapse )
    {
        nScrollBody.style.height = _fnStringToCss( o.oScroll.sY );

        var iExtra = (o.oScroll.sX !== "" && o.nTable.offsetWidth > nScrollBody.offsetWidth) ?
             o.oScroll.iBarWidth : 0;
        if ( o.nTable.offsetHeight < nScrollBody.offsetHeight )
        {
            nScrollBody.style.height = _fnStringToCss( $(o.nTable).height()+iExtra );
        }
    }

    /* Finally set the width's of the header and footer tables */
    var iOuterWidth = $(o.nTable).outerWidth();
    nScrollHeadTable.style.width = _fnStringToCss( iOuterWidth );
    nScrollHeadInner.style.width = _fnStringToCss( iOuterWidth );

    if ( o.nTFoot !== null )
    {
        nScrollFootInner.style.width = _fnStringToCss( o.nTable.offsetWidth );
        nScrollFootTable.style.width = _fnStringToCss( o.nTable.offsetWidth );
    }

    /* If sorting or filtering has occurred, jump the scrolling back to the top */
    if ( o.bSorted || o.bFiltered )
    {
        nScrollBody.scrollTop = 0;
    }
}


/**
 * Apply a given function to the display child nodes of an element array (typically
 * TD children of TR rows
 *  @param {function} fn Method to apply to the objects
 *  @param array {nodes} an1 List of elements to look through for display children
 *  @param array {nodes} an2 Another list (identical structure to the first) - optional
 *  @memberof DataTable#oApi
 */
function _fnApplyToChildren( fn, an1, an2 )
{
    for ( var i=0, iLen=an1.length ; i<iLen ; i++ )
    {
        for ( var j=0, jLen=an1[i].childNodes.length ; j<jLen ; j++ )
        {
            if ( an1[i].childNodes[j].nodeType == 1 )
            {
                if ( an2 )
                {
                    fn( an1[i].childNodes[j], an2[i].childNodes[j] );
                }
                else
                {
                    fn( an1[i].childNodes[j] );
                }
            }
        }
    }
}

