/**
 * Test Panel for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var settings = require("ext/settings/settings");
var panels = require("ext/panels/panels");
var markup = require("text!ext/testpanel/testpanel.xml");
var fs = require("ext/filesystem/filesystem");

module.exports = ext.register("ext/testpanel/testpanel", {
    name            : "Test Panel",
    dev             : "Ajax.org",
    alone           : true,
    type            : ext.GENERAL,
    markup          : markup,

    hook : function(){
        panels.register(this);
        
        // fix to prevent Active Files button is placed above Project Files
        var btn = this.button = navbar.insertBefore(new apf.button({
            skin    : "mnubtn",
            state   : "true",
            "class" : "testing",
            caption : "Test"
        }), navbar.lastChild.previousSibling);

        var _self = this;
        var model = this.model = new apf.model().load("<files />");

        btn.addEventListener("mousedown", function(e){
            var value = this.value;
            if (navbar.current && (navbar.current != _self || value)) {
                navbar.current.disable(navbar.current == _self);
                if (value) {
                    return;
                }
            }

            panels.initPanel(_self);
            _self.enable(true);
        });
    },

    init : function() {
        this.panel = winTestPanel;

        var _self = this;
        colLeft.appendChild(winTestPanel);
        
        mnuFilter.onitemclick = function(e){
            _self.filter(e.value);
        }
    
        var shiftState;
        apf.addListener(document, "keydown", function(e){
            shiftState = (e || event).shiftKey;
        });
        
        apf.addListener(document, "keyup", function(e){
            shiftState = (e || event).shiftKey ? false : shiftState;
        });
    
        dgTestProject.addEventListener("afterchoose", function(e){
            var node = this.selected;
            if (!node || this.selection.length > 1)
                return;

            //Open
            if (shiftState) {
                if (node.tagName != "file"
                  || !ide.onLine && !ide.offlineFileSystemSupport)
                    return;
                        
                ide.dispatchEvent("openfile", {doc: ide.createDocument(node)});
                
                //@todo choose a test or an assert should select that code
                //      inside ace.
            }
            //Run
            else {
                if ("file|test|repo".indexOf(node.tagName) == -1 || !ide.onLine)
                    return;
                
                _self.run([node]);
            }
        });
        
        this.submodules = [];
        fs.readFile("/workspace/.git/config", function(data){
            data.replace(/\[submodule "([^"]*)"\]/g, function(s, m){
                var doc = mdlTests.data.ownerDocument;
                var node = doc.createElement("repo");
                node.setAttribute("name", m);
                mdlTests.appendXml(node);
                
                _self.submodules.push(m);
            });
        });
    },
    
    findParent : function(path){
        var _self = this;
        for (var i = 0; i < _self.submodules.length; i++) {
            if (path.match(new RegExp("^\/workspace\/" + _self.submodules[i].replace(/\//g, "\\\/"))))
                return mdlTests.queryNode("repo[@name='" + _self.submodules[i].replace(/'/g, "\\'") + "']");
        }
        
        return mdlTests.queryNode("repo[1]");
    },
    
    filter : function(value){
        dgTestProject.setAttribute("each", value == "all"
            ? "[repo|file|test|assert]"
            : "[repo|file[@type='" + value + "']|type|assert]");
    },
    
    parseFile : function(xmlNode){
        ide.dispatchEvent("test.expand." + xmlNode.getAttribute("type"), {
            xmlNode : xmlNode
        });
        
        return "<file />";
    },
    
    getIcon : function(xmlNode) {
        if (xmlNode.tagName == "repo")
            return "folder.png";
        if (xmlNode.tagName == "test")
            return "brkp_obj.gif";
        if (xmlNode.tagName == "assert")
            return "brkp_obj.gif";
        if (xmlNode.tagName == "error")
            return "exclamation.png";
        else
            return ide.dispatchEvent("test.icon." 
                + xmlNode.getAttribute("type")) || "page_white_text.png";
    },
    
    run : function(nodes){
        var _self = this;
        
        if (!nodes)
            return;
        
        var finish = function(){
            //done
        }
        
        //Clean nodes
        nodes.each(function(node) {
            if (node.tagName == "test")
                node = node.parentNode;
            
            var cleanNodes = node.selectNodes(".//file|.//test");
            for (var k = 0; k < cleanNodes.length; k++) {
                apf.xmldb.removeAttribute(cleanNodes[k], "status");
            }
            var errorNodes = node.selectNodes(".//error");
            for (var k = 0; k < errorNodes.length; k++) {
                apf.xmldb.removeNode(errorNodes[k]);
            }
            var assertNodes = node.selectNodes(".//assert");
            for (var k = 0; k < assertNodes.length; k++) {
                apf.xmldb.removeNode(assertNodes[k]);
            }
        });
        
        //Expand list
        var total = [];
        nodes.each(function(node){
            if (node.tagName == "repo")
                total = total.concat(apf.getArrayFromNodelist(node.selectNodes("file")));
            else if (node.tagName == "file")
                total.push(node);
            else if (node.tagName == "test")
                total.push(node.parentNode);
        });
        
        var i = 0;
        
        var next = function(){
            if (total[i]) {
                _self.setLog(total[i], "connecting");
                ide.dispatchEvent("test.run." + total[i].getAttribute("type"), {
                    xmlNode : total[i++],
                    next    : next
                });
            }
            else {
                finish();
            }
        };
        next();
    },
    
    stop : function(){
        ide.dispatchEvent("test.stop");
    },
    
    setPass : function(xmlNode, msg){
        apf.xmldb.setAttribute(xmlNode, "status", 1);
        apf.xmldb.setAttribute(xmlNode, "status-message", msg || "");
    },
    setError : function(xmlNode, msg){
        apf.xmldb.setAttribute(xmlNode, "status", 0);
        apf.xmldb.setAttribute(xmlNode, "status-message", msg || "");
    },
    setLog : function(xmlNode, msg){
        apf.xmldb.setAttribute(xmlNode, "status", -1);
        apf.xmldb.setAttribute(xmlNode, "status-message", msg || "");
    },
    
    toggleSubmodules : function(value){
        if (!value) {
            dgTestProject.setAttribute("each", 
                "[" + dgTestProject.each.replace(/repo/, "repo[1]") + "]");
        }
        else {
            dgTestProject.setAttribute("each", 
                "[" + dgTestProject.each.replace(/repo\[1\]/, "repo") + "]");
        }
    },
    
    show : function(){
        if (navbar.current) {
            if (navbar.current == this)
                return;
            navbar.current.disable();
        }
        
        panels.initPanel(this);
        this.enable();
    },

    enable : function(noButton){
        if (self.winTestPanel)
            winTestPanel.show();
        colLeft.show();
        if (!noButton) {
            this.button.setValue(true);
            if(navbar.current && (navbar.current != this))
                navbar.current.disable(false);
        }
        splitterPanelLeft.show();
        navbar.current = this;
    },

    disable : function(noButton){
        if (self.winTestPanel)
            winTestPanel.hide();
        if (!noButton)
            this.button.setValue(false);

        splitterPanelLeft.hide();
    },

    destroy : function(){
        panels.unregister(this);
    }
});

});