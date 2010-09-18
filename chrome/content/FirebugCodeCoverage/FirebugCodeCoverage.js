/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Initial Developer of the Original Code is Parakey Inc.
 *
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *     Joe Hewitt <joe@joehewitt.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************

Firebug.Profiler.toggleProfiling = function(context)
{
	if( Firebug.CodeCoverager.coveraging == false )
	{
		if (fbs.profiling)
			this.stopProfiling(context);
		else
			this.startProfiling(context);
	}
};

Firebug.CodeCoverager = extend(Firebug.Module,
{
	coveraging: false,

    toggleCoverage: function(context)
    {
		if( this.coveraging )
			this.stopCoveraging(context);
		else if( fbs.profiling == false )
			this.startCoveraging(context);
    },

    startCoveraging: function(context, title)
    {
		this.coveraging = true;
        fbs.startProfiling();

        context.chrome.setGlobalAttribute("cmd_toggleCoverage", "checked", "true");

        var isCustomMessage = !!title;
        if (!isCustomMessage)
            title = 'Code Coverage Monitor has started.  Run your tests now.';

        context.coverageRow = this.logCoverageRow(context, title);
        context.coverageRow.customMessage = isCustomMessage;
    },

    stopCoveraging: function(context, cancelReport)
    {
		this.coveraging = false;
        var totalTime = fbs.stopProfiling();
        if (totalTime == -1)
            return;

        context.chrome.setGlobalAttribute("cmd_toggleCoverage", "checked", "false");

        if (cancelReport)
            delete context.coverageRow;
        else
            this.logCoverageReport(context)
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    logCoverageRow: function(context, title)
    {
        var row = Firebug.Console.openGroup(title, context, "profile",
            Firebug.CodeCoverager.CoverageCaption, true, null, true);
        setClass(row, "profilerRunning");
        
        Firebug.Console.closeGroup(context, true);
        
        return row;
    },

    logCoverageReport: function(context)
    {
        var totalTime = 0;
		var totalFiles = 0;
		var fileIndeces = {};
		var files = [];
        
        updateScriptFiles(context);
        var sourceFileMap = context.sourceFileMap;
        
        jsd.enumerateScripts({enumerateScript: function(script)
        {
			url = normalizeURL(script.fileName);
			if (script.callCount)
			{
				if (url in sourceFileMap)
				{
                    totalTime += script.totalOwnExecutionTime;

					if( !fileIndeces[ url ] )
					{
						fileIndeces[ url ] = files.length;
						files.push( new ProfileFile( script, context, 0, 0 ) );
						totalFiles++;
					} else {
						files[ fileIndeces[ url ] ].addCall( script, context );
					}

                    script.clearProfileData();
                }
			} else {
				if (url in sourceFileMap)
				{
					if( !fileIndeces[ url ] )
					{
						fileIndeces[ url ] = files.length;
						files.push( new ProfileFile( script, context, 0, 0 ) );
						totalFiles++;
					} else {
						files[ fileIndeces[ url ] ].addNonCall( script, context );
					}

                    script.clearProfileData();
                }
			}
        }});

		for (var i = 0; i < files.length; ++i)
		{
			var totalCalls = files[i].calls.length + files[i].nonCalls.length;
			if( totalCalls > 0 ) files[i].percent = Math.round((files[i].calls.length/(totalCalls)) * 100 * 100) / 100;
			else files[i].percent = '';
		}

        totalTime = Math.round(totalTime * 1000) / 1000;

		var groupRow = context.coverageRow && context.coverageRow.ownerDocument
            ? context.coverageRow
            : this.logCoverageRow(context, "");
        delete context.coverageRow;

        removeClass(groupRow, "profilerRunning");
        
        if (totalFiles > 0)
        {
            var captionBox = getElementByClass(groupRow, "profileCaption");
            if (!groupRow.customMessage)
				//captionBox.textContent = $STR("Profile");
				captionBox.textContent = 'Code Coverage'; // $STR
            var timeBox = getElementByClass(groupRow, "profileTime");
            timeBox.textContent = '(' + totalTime + 'ms, ' + totalFiles + ' files)';//$STRF("ProfileTime", [totalTime, totalCalls]);

            var groupBody = groupRow.lastChild;
            var table = Firebug.CodeCoverager.CoverageTable.tag.replace({}, groupBody);
            var tbody = table.lastChild;

            var tag = Firebug.CodeCoverager.CoverageCall.tag;
            var insert = tag.insertRows;

			for (var i = 0; i < files.length; ++i)
				if( files[i].calls.length > 0 || files[i].nonCalls.length > 0 )
					context.throttle(insert, tag, [{object: files[i]}, tbody]);

            context.throttle(groupRow.scrollIntoView, groupRow);
        }
        else
        {
            var captionBox = getElementByClass(groupRow, "profileCaption");
            captionBox.textContent = 'Nothing to show coverage for.'; // $STR
        }
    }
});

// ************************************************************************************************

Firebug.CodeCoverager.CoverageTable = domplate(
{
    tag:
        TABLE({class: "coverageTable", cellspacing: 0, cellpadding: 0, width: "100%"},
            TBODY(
                TR({class: "headerRow", onclick: "$onClick"},
					TD({class: "headerCell headerSorted alphaValue"},
                        DIV({class: "headerCellBox"},
                            $STR("File")
                        )
                    ),
                    TD({class: "headerCell"},
                        DIV({class: "headerCellBox", title: $STR("PercentTooltip")},
                            $STR("Percent")
                        )
                    ),
					TD({class: "headerCell"},
                        DIV({class: "headerCellBox"},
                            'Functions Called'
                        )
                    ),
					TD({class: "headerCell"},
                        DIV({class: "headerCellBox"},
                            'Functions Uncalled'
                        )
                    )
                )
            )
        ),

     onClick: function(event)
    {
        var table = getAncestorByClass(event.target, "coverageTable");
        var header = getAncestorByClass(event.target, "headerCell");
        if (!header)
            return;
        
        var numerical = !hasClass(header, "alphaValue");
        
        var colIndex = 0;
        for (header = header.previousSibling; header; header = header.previousSibling)
            ++colIndex;
        
        this.sort(table, colIndex, numerical);
    },
    
    sort: function(table, colIndex, numerical)
    {
        var tbody = table.lastChild;
                    
        var values = [];
        for (var row = tbody.childNodes[1]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
			if( cell.textContent )
				var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
			else
				var value = numerical ? 0 : '';
            values.push({row: row, value: value});
        }
        
        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = tbody.firstChild;
        var headerSorted = getChildByClass(headerRow, "headerSorted");
        removeClass(headerSorted, "headerSorted");

        var header = headerRow.childNodes[colIndex];
        setClass(header, "headerSorted");

        if (!header.sorted || header.sorted == 1)
        {
            removeClass(header, "sortedDescending");
            setClass(header, "sortedAscending");

            header.sorted = -1;
            
            for (var i = 0; i < values.length; ++i)
                tbody.appendChild(values[i].row);
        }
        else
        {
            removeClass(header, "sortedAscending");
            setClass(header, "sortedDescending");

            header.sorted = 1;
            
            for (var i = values.length-1; i >= 0; --i)
                tbody.appendChild(values[i].row);
        }
    }
});

// ************************************************************************************************

Firebug.CodeCoverager.CoverageCaption = domplate(Firebug.Rep,
{
    tag:
        SPAN({class: "profileTitle"},
            SPAN({class: "profileCaption"}, "$objects"),
            " ",
            SPAN({class: "profileTime"}, "")
        )
});

// ************************************************************************************************

Firebug.CodeCoverager.CoverageCall = domplate(Firebug.Rep,
{
    tag: 
        TR({style: "border-bottom: 1px solid #999"},
            TD({style: "vertical-align:top"},"$object.script.fileName"),
            TD({style: "vertical-align:top"},"$object.percent|getPercent"),
            TD({style: "vertical-align:top"},"$object.calls|getList"),
            TD({style: "vertical-align:top"},"$object.nonCalls|getList")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

	getPercent: function( number )
	{
		return number != null && number != '' ? number + '%' : '';
	},
	getList: function( listArr )
	{
		return listArr.join( ", " );
	},

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    className: "profile",

    supportsObject: function(object)
    {
        return object instanceof ProfileFile;
    },
    
    inspectObject: function(call, context)
    {
        var sourceLink = this.getSourceLink(call);
        context.chrome.select(sourceLink);
    },
    
    getTooltip: function(call)
    {
        var fn = call.script.functionObject.getWrappedValue();
        return FirebugReps.Func.getTooltip(fn);
    },
    
    getContextMenuItems: function(call, target, context)
    {
        var fn = call.script.functionObject.getWrappedValue();
        return FirebugReps.Func.getContextMenuItems(fn, call.script, context);
    }
});

// ************************************************************************************************

function ProfileFile(script, context, callCounter, nonCallCounter)
{
    this.script = script;
    this.context = context;
    this.callCounter = callCounter;
    this.nonCallCounter = nonCallCounter;
	this.callIndeces = {};
	this.calls = [];
	this.nonCallIndeces = {};
	this.nonCalls = [];
	this.addCall = function( script, context )
	{
		var functionName = getFunctionName( script, context );
		this.callCounter++;
		if( functionName != null && functionName != '(no name)' && this.callIndeces[ functionName ] != true )
		{
			this.callIndeces[ functionName ] = true;
			this.calls.push( functionName );
		}
	};
	this.addNonCall = function( script, context )
	{
		var functionName = getFunctionName( script, context );
		this.nonCallCounter++;
		if( functionName != null && functionName != '(no name)' && this.nonCallIndeces[ functionName ] != true )
		{
			this.nonCallIndeces[ functionName ] = true;
			this.nonCalls.push( functionName );
		}
	};
}
// ************************************************************************************************

Firebug.registerModule(Firebug.CodeCoverager);
Firebug.registerRep(Firebug.CodeCoverager.CoverageCall);

// ************************************************************************************************

}});