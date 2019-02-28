"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@angular/core");
var mention_utils_1 = require("./mention-utils");
var caret_coords_1 = require("./caret-coords");
var styles = ["\n.mentionItemList {\n  list-style: none;\n  border-collapse: collapse;\n  padding: 0;\n  margin: 2px 0 0;\n  box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px 0 rgba(0,0,0,.14), 0 1px 10px 0 rgba(0,0,0,.12);\n  overflow: auto;\n  max-height: 300px;\n  height: auto;\n  background-color: white;\n  position: absolute;\n  top: auto;\n  left: auto;\n  z-index: 1000;\n  min-width: 160px;\n  font-size: 14px;\n  text-align: left;\n  border-radius: 2px;\n}\n.mentionItem:hover, .mentionItem.active {\n  background-color: #ccc;\n}\n[hidden] {\n  display: none;\n}\n"
];
/**
 * Angular 2 Mentions.
 * https://github.com/dmacfarlane/angular-mentions
 *
 * Copyright (c) 2016 Dan MacFarlane
 */
var MentionListComponent = /** @class */ (function () {
    function MentionListComponent(element) {
        this.element = element;
        this.labelKey = 'label';
        this.itemClick = new core_1.EventEmitter();
        this.items = [];
        this.activeIndex = 0;
        this.hidden = false;
    }
    MentionListComponent.prototype.ngOnInit = function () {
        if (!this.itemTemplate) {
            this.itemTemplate = this.defaultItemTemplate;
        }
    };
    // lots of confusion here between relative coordinates and containers
    MentionListComponent.prototype.position = function (nativeParentElement, iframe, dropUp) {
        if (iframe === void 0) { iframe = null; }
        var coords = { top: 0, left: 0 };
        if (mention_utils_1.isInputOrTextAreaElement(nativeParentElement)) {
            // parent elements need to have postition:relative for this to work correctly?
            coords = caret_coords_1.getCaretCoordinates(nativeParentElement, nativeParentElement.selectionStart);
            coords.top = nativeParentElement.offsetTop + coords.top + 16;
            coords.left = nativeParentElement.offsetLeft + coords.left;
        }
        else if (iframe) {
            var context = { iframe: iframe, parent: iframe.offsetParent };
            coords = mention_utils_1.getContentEditableCaretCoords(context);
        }
        else {
            var doc = document.documentElement;
            var scrollLeft = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
            var scrollTop = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
            // bounding rectangles are relative to view, offsets are relative to container?
            var caretRelativeToView = mention_utils_1.getContentEditableCaretCoords({ iframe: iframe });
            var parentRelativeToContainer = nativeParentElement.getBoundingClientRect();
            // coords.top = caretRelativeToView.top - parentRelativeToContainer.top + nativeParentElement.offsetTop - scrollTop;
            // coords.left = caretRelativeToView.left - parentRelativeToContainer.left + nativeParentElement.offsetLeft - scrollLeft;
            // Not to depend on parent element by fixing bug that search list will be hidden if parent is overflow is hidden
            coords.top = caretRelativeToView.top;
            coords.left = caretRelativeToView.left;
        }
        var el = this.element.nativeElement;
        this.list.nativeElement.style.marginBottom = dropUp ? '24px' : null;
        el.className = dropUp ? 'dropup' : null;
        el.style.position = 'absolute';
        el.style.left = coords.left + 'px';
        el.style.top = coords.top + 'px';
    };
    Object.defineProperty(MentionListComponent.prototype, "activeItem", {
        get: function () {
            return this.items[this.activeIndex];
        },
        enumerable: true,
        configurable: true
    });
    MentionListComponent.prototype.activateNextItem = function () {
        // adjust scrollable-menu offset if the next item is out of view
        var listEl = this.list.nativeElement;
        var activeEl = listEl.getElementsByClassName('active').item(0);
        if (activeEl) {
            var nextLiEl = activeEl.nextSibling;
            if (nextLiEl && nextLiEl.nodeName == 'LI') {
                var nextLiRect = nextLiEl.getBoundingClientRect();
                if (nextLiRect.bottom > listEl.getBoundingClientRect().bottom) {
                    listEl.scrollTop = nextLiEl.offsetTop + nextLiRect.height - listEl.clientHeight;
                }
            }
        }
        // select the next item
        this.activeIndex = Math.max(Math.min(this.activeIndex + 1, this.items.length - 1), 0);
    };
    MentionListComponent.prototype.activatePreviousItem = function () {
        // adjust the scrollable-menu offset if the previous item is out of view
        var listEl = this.list.nativeElement;
        var activeEl = listEl.getElementsByClassName('active').item(0);
        if (activeEl) {
            var prevLiEl = activeEl.previousSibling;
            if (prevLiEl && prevLiEl.nodeName == 'LI') {
                var prevLiRect = prevLiEl.getBoundingClientRect();
                if (prevLiRect.top < listEl.getBoundingClientRect().top) {
                    listEl.scrollTop = prevLiEl.offsetTop;
                }
            }
        }
        // select the previous item
        this.activeIndex = Math.max(Math.min(this.activeIndex - 1, this.items.length - 1), 0);
    };
    MentionListComponent.prototype.resetScroll = function () {
        this.list.nativeElement.scrollTop = 0;
    };
    __decorate([
        core_1.Input(),
        __metadata("design:type", Object)
    ], MentionListComponent.prototype, "labelKey", void 0);
    __decorate([
        core_1.Input(),
        __metadata("design:type", core_1.TemplateRef)
    ], MentionListComponent.prototype, "itemTemplate", void 0);
    __decorate([
        core_1.Output(),
        __metadata("design:type", Object)
    ], MentionListComponent.prototype, "itemClick", void 0);
    __decorate([
        core_1.ViewChild('list'),
        __metadata("design:type", core_1.ElementRef)
    ], MentionListComponent.prototype, "list", void 0);
    __decorate([
        core_1.ViewChild('defaultItemTemplate'),
        __metadata("design:type", core_1.TemplateRef)
    ], MentionListComponent.prototype, "defaultItemTemplate", void 0);
    MentionListComponent = __decorate([
        core_1.Component({
            selector: 'mention-list',
            styles: styles,
            template: "\n    <ng-template #defaultItemTemplate let-item=\"item\">\n      {{item[labelKey]}}\n    </ng-template>\n    <ul #list [hidden]=\"hidden\" class=\"mentionItemList\">\n      <li *ngFor=\"let item of items; let i = index\" [ngClass]=\"{mentionItem: true, active: activeIndex==i}\">\n        <a class=\"dropdown-item\" (mousedown)=\"activeIndex=i;itemClick.emit();$event.preventDefault()\">\n          <ng-template [ngTemplateOutlet]=\"itemTemplate\" [ngTemplateOutletContext]=\"{'item':item}\"></ng-template>\n        </a>\n      </li>\n    </ul>\n  "
        }),
        __metadata("design:paramtypes", [core_1.ElementRef])
    ], MentionListComponent);
    return MentionListComponent;
}());
exports.MentionListComponent = MentionListComponent;