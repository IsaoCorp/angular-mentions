import {
  Directive,
  ElementRef,
  ComponentFactoryResolver,
  ViewContainerRef,
  TemplateRef,
  ApplicationRef,
  Injector, EmbeddedViewRef, ComponentRef, HostListener
} from '@angular/core';
import { Input, EventEmitter, Output, OnChanges, SimpleChanges } from '@angular/core';

import { MentionConfig } from './mention-config';
import { MentionListComponent } from './mention-list.component';
import { getCaretPosition, getElValueExcludeHtml, getValue, setCaretPosition } from './mention-utils';
import { UserAgentService } from './user-agent.service';
import { BrowserType } from './browser-type';

const KEY_BACKSPACE = 8;
const KEY_TAB = 9;
const KEY_ENTER = 13;
const KEY_SHIFT = 16;
const KEY_ESCAPE = 27;
const KEY_SPACE = 32;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
const KEY_2 = 50;

const IME_INPUT_STATUS = Object.freeze({
  NONE: 0,
  INPUTTING: 1,
  FIXED: 2
});

/**
 * Angular 2 Mentions.
 * https://github.com/dmacfarlane/angular-mentions
 *
 * Copyright (c) 2017 Dan MacFarlane
 */
@Directive({
  selector: '[mention], [mentionConfig]',
})
export class MentionDirective implements OnChanges {

  @Input() disabledMention = false;

  // stores the items passed to the mentions directive and used to populate the root items in mentionConfig
  private mentionItems: any[];

  @Input('mention') set mention(items: any[]) {
    if (this.disabledMention) {
      return;
    }
    this.mentionItems = items;

  }

  // the provided configuration object
  @Input() mentionConfig: MentionConfig = {items: []};

  private activeConfig: MentionConfig; // = this.DEFAULT_CONFIG;

  private DEFAULT_CONFIG: MentionConfig = {
    items: [],
    triggerChar: '@',
    labelKey: 'label',
    maxItems: -1,
    mentionSelect: (item: any) => this.activeConfig.triggerChar + item[this.activeConfig.labelKey]
  };

  // template to use for rendering list items
  @Input() mentionListTemplate: TemplateRef<any>;

  // event emitted whenever the search term changes
  @Output() searchTerm = new EventEmitter();

  // event emitted when selected item on mention search list
  @Output() selectedMention = new EventEmitter();

  // [Goalous Fix] Delete this option because originally there are some bugs if not async operation.
  // option to diable internal filtering. can be used to show the full list returned
  // from an async operation (or allows a custom filter function to be used - in future)
  // private disableSearch = false;

  private triggerChars: {[key: string]: MentionConfig} = {};

  searchString = '';
  startPos: number;
  startNode;
  searchList: MentionListComponent;
  stopSearch: boolean;
  iframe: any; // optional
  keyDownCode: number;
  isComposing = false;
  isAndroid = false;
  isFirefox = false;
  isPcSafari = false;
  inComposition = false;
  isKeyHandlerDone = false;
  isAttachedEventForRemoveMention = false;

  constructor(
    private _element: ElementRef,
    private _componentResolver: ComponentFactoryResolver,
    private _viewContainerRef: ViewContainerRef,
    private appRef: ApplicationRef,
    private injector: Injector,
    private uaService: UserAgentService
  ) {
    console.log(this.uaService.browserType);
    this.isPcSafari = this.uaService.browserType === BrowserType.SAFARI && this.uaService.isPcDevice();
    this.isAndroid = this.uaService.isAndroid();
    console.log('isPc:' + this.uaService.isPcDevice());
    console.log('isAndroid:' + this.isAndroid);
    console.log('isPcSafari:' + this.isPcSafari);
  }

  addEventForRemoveMention() {
    // TODO: GL-7859 is not completed fixing
    // when enter backspace after selected multiple mentions, all mentions are deleted.
    // The cause: `this._element.nativeElement.removeChild(prevEL);` fire new DOMNodeRemoved event
    // How to fix: stop using removeChild and instead, replace html

    // if (!this.isFirefox) {
    //   return;
    // }
    // if (this.isAttachedEventForRemoveMention) {
    //   return;
    // }
    // this._element.nativeElement.addEventListener('DOMNodeRemoved', (e) => {
    //   // e.preventDefault();
    //   // e.stopPropagation();
    //   if (this.keyDownCode !== KEY_BACKSPACE) {
    //     return;
    //   }
    //   const prevEL = prev(e.target);
    //   if (prevEL && prevEL.tagName === 'SPAN') {
    //     this._element.nativeElement.removeChild(prevEL);
    //   }
    //   return true;
    // });
    // this.isAttachedEventForRemoveMention = true;
  }


  ngOnChanges(changes: SimpleChanges) {
    console.log('config change', changes);
    if (changes['mention'] || changes['mentionConfig']) {
      this.updateConfig();
    }
  }

  private updateConfig() {
    if (this.disabledMention) {
      return;
    }

    const config = this.mentionConfig;
    this.triggerChars = {};
    // use items from directive if they have been set
    if (this.mentionItems) {
      config.items = this.mentionItems;
    }
    this.addConfig(config);
    // nested configs
    if (config.mentions) {
      config.mentions.forEach(config => this.addConfig(config));
    }
  }

  // add configuration for a trigger char
  private addConfig(config: MentionConfig) {
    // defaults
    const defaults = Object.assign({}, this.DEFAULT_CONFIG);
    config = Object.assign(defaults, config);
    // items
    let items = config.items;
    if (items && items.length > 0) {
      // convert strings to objects
      if (typeof items[0] === 'string') {
        items = items.map((label) => {
          const object = {};
          object[config.labelKey] = label;
          return object;
        });
      }
      // remove items without an labelKey (as it's required to filter the list)
      items = items.filter(e => e[config.labelKey]);
      if (!config.disableSort) {
        items.sort((a, b) => a[config.labelKey].localeCompare(b[config.labelKey]));
      }
    }
    config.items = items;

    // add the config
    this.triggerChars[config.triggerChar] = config;

    // for async update while menu/search is active
    if (this.activeConfig && this.activeConfig.triggerChar === config.triggerChar) {
      this.activeConfig = config;
      // this.updateSearchList(false);
      this.updateSearchList();
    }
  }

  setIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  stopEvent(event: any) {
    // if (event instanceof Event) { // does not work for iframe
    if (!event.wasClick) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  @HostListener('blur', ['$event'])
  blurHandler(event: any) {
    if (this.disabledMention) {
      return;
    }

    this.stopEvent(event);
    this.stopSearch = true;
    if (this.searchList) {
      this.searchList.hidden = true;
    }
  }

  // @HostListener('compositionstart ', ['$event'])
  // @HostListener('compositionupdate ', ['$event'])
  // onComposition() {
  //   // this.inCompositionEnd = false;
  //   this.inComposition = true;
  //   this.imeInputStatus = IME_INPUT_STATUS.INPUTTING;
  // }
  // @HostListener('compositionend', ['$event'])
  // onCompositionEnd() {
  //   this.inComposition = false;
  //   this.imeInputStatus = IME_INPUT_STATUS.FIXED;
  // }

  getImeInputStatus(keyDownCode: number, keyUpCode: number, event: any) {
    if (this.isPcSafari) {
      if (event.isComposing) {
        return IME_INPUT_STATUS.INPUTTING;
      } else if (keyUpCode === KEY_ENTER) {
        return IME_INPUT_STATUS.FIXED;
      }
      return IME_INPUT_STATUS.NONE;
    }

    // [Caution ]On Android, Keycode value is return as 229 for all keys
    if (this.isAndroid) {
      return IME_INPUT_STATUS.NONE;
    }
    if (keyDownCode !== 229) {
      return IME_INPUT_STATUS.NONE;
    }
    return keyUpCode === KEY_ENTER ? IME_INPUT_STATUS.FIXED : IME_INPUT_STATUS.INPUTTING;
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: any, nativeElement: HTMLInputElement = this._element.nativeElement) {
    console.log('■keydown');
    console.log({which: event.which, keyCode: event.keyCode, char: event.key});
    if (this.disabledMention) {
      return;
    }
    console.log({isComposing: event.isComposing});
    this.keyDownCode = event.which || event.keyCode;
    if (this.isPcSafari && !event.isComposing) {
      this.isKeyHandlerDone = true;
      this.keyHandler(event, nativeElement);
    } else if (this.keyDownCode !== 229 || this.isAndroid) {
      this.isKeyHandlerDone = true;
      this.keyHandler(event, nativeElement);
    }
  }

  @HostListener('keyup', ['$event'])
  onKeyUp(event: any, nativeElement: HTMLInputElement = this._element.nativeElement) {
    console.log('■keyup');
    console.log({which: event.which, keyCode: event.keyCode, char: event.key});
    if (this.disabledMention) {
      return;
    }
    if (this.isKeyHandlerDone) {
      this.isKeyHandlerDone = false;
      return;
    }

    console.log({isComposing: event.isComposing});
    if (event.isComposing && this.isPcSafari && this.uaService.isPcDevice()) {
      this.isKeyHandlerDone = false;
      return;
    }

    const charCode = event.which || event.keyCode;
    const imeInputStatus = this.getImeInputStatus(this.keyDownCode, charCode, event);
    console.log({imeInputStatus});
    if (imeInputStatus === IME_INPUT_STATUS.FIXED || event.shiftKey || this.isPcSafari) {
      this.keyHandler(event, nativeElement);
    }
    this.isKeyHandlerDone = false;
  }

  keyHandler(event: any, nativeElement: HTMLInputElement, ) {
    console.log('■keyHandler');
    let charCode = event.which || event.keyCode;
    const imeInputStatus = this.getImeInputStatus(this.keyDownCode, charCode, event);
    if (!event.wasClick) {
      this.isComposing = event.isComposing;
    }

    // Fix bug: getValue gets all content but originally it is right to get only current row value except html
    let val: string = getValue(nativeElement);
    val = getElValueExcludeHtml(nativeElement, this.iframe);

    let pos = getCaretPosition(nativeElement, this.iframe);
    let charPressed = event.key;
    console.log({charPressed, pos, val, charCode, startPos: this.startPos});
    if (event.shiftKey && charCode === KEY_2) {
      charPressed = '@';
      console.log('--- enter @ in us keyboard');
    }
    if (!charPressed) {
      if (!event.shiftKey && (charCode >= 65 && charCode <= 90)) {
        charPressed = String.fromCharCode(charCode + 32);
      }
      else {
        // TODO (dmacfarlane) fix this for non-alpha keys
        // http://stackoverflow.com/questions/2220196/how-to-decode-character-pressed-from-jquerys-keydowns-event-handler?lq=1
        charPressed = String.fromCharCode(charCode);
      }
      console.log('--- if !charPressed');
      console.log({charPressed});
    } else if (this.isAndroid) {
      // [Caution ]On Android, Keycode value is return as 229 for all keys
      // https://stackoverflow.com/questions/39035374/keycode-value-is-return-as-229-for-all-keys
      if (charCode === 0 || charCode === 229) {
        const mentionRangeVal = val.substring(0, pos);
        const lastIdx = mentionRangeVal.length - 1;
        charCode = mentionRangeVal.charCodeAt(lastIdx);
        charPressed = mentionRangeVal.substr(lastIdx);
        console.log({charCode, charPressed, val, mentionRangeVal, isComposing: this.isComposing});
      }
    }

    console.log({val, pos, charPressed, startPos: this.startPos});

    if (charCode === KEY_SPACE && this.activeConfig && !this.searchList.hidden) {
      console.log('--- if charCode === KEY_SPACE && this.activeConfig && !this.searchList.hidden');
      this.resetSearchList();
      return;
    }


    if (charCode === KEY_ENTER && event.wasClick && pos < this.startPos) {
      console.log('--- if (event.keyCode === KEY_ENTER && event.wasClick && pos < this.startPos)');
      // put caret back in position prior to contenteditable menu click
      pos = this.startNode.length;
      setCaretPosition(this.startNode, pos, this.iframe);
    }
    console.log('keyHandler', this.startPos, pos, val, charPressed, event);

    const config = this.triggerChars[charPressed];
    if (config && (!this.isAndroid || (this.isAndroid && !this.isComposing))) {
      console.log('--- triggerChara entered');
      this.activeConfig = config;
      this.startPos = pos;
      let tmpChara = val.substring(this.startPos - 1, this.startPos);
      console.log({tmpChara});
      if (tmpChara.length > 0) {
        if (tmpChara === charPressed) {
          this.startPos--;
        }
      } else {
        tmpChara = val.substring(this.startPos + 1, this.startPos + 2);
        console.log('val.substring(this.startPos + 1, this.startPos + 2)');
        console.log({tmpChara});
        if (tmpChara === charPressed) {
          this.startPos++;
        }
      }

      if (this.startPos < 0) {
        console.log('this.startPos < 0 set this.startPos = 0');
        this.startPos = 0;
      }

      this.startNode = (this.iframe ? this.iframe.contentWindow.getSelection() : window.getSelection()).anchorNode;
      this.stopSearch = false;
      this.searchString = '';
      this.showSearchList(nativeElement);
      // Comment outt prevent to show search list when just input triggerChara
      // this.updateSearchList();
      // this.activeConfig.items = [];
      console.log('--- triggerChara entered');
    } else if (this.startPos >= 0 && !this.stopSearch) {
      console.log('--- this.startPos >= 0 && !this.stopSearch');
      if (pos <= this.startPos) {
        this.searchList.hidden = true;
      }
      // ignore shift when pressed alone, but not when used with another key
      else if (charCode !== KEY_SHIFT &&
        !event.metaKey &&
        !event.altKey &&
        !event.ctrlKey &&
        pos > this.startPos
      ) {
        console.log('--- if (charCode === KEY_ENTER && event.wasClick && pos < this.startPos)');
        if (charCode === KEY_SPACE) {
          this.startPos = -1;
        }
        else if (charCode === KEY_BACKSPACE && pos > 0) {
          pos--;
          if (pos === this.startPos) {
            this.stopSearch = true;
          }
          this.searchList.hidden = this.stopSearch;
        }
        else if (!this.searchList.hidden) {
          if (charCode === KEY_TAB
            || (charCode === KEY_ENTER && this.isPcSafari)
            || (charCode === KEY_ENTER && imeInputStatus === IME_INPUT_STATUS.NONE)
            || (charCode === KEY_ENTER && imeInputStatus === IME_INPUT_STATUS.FIXED && event.wasClick)
          ) {
            console.log('--- this.startPos >= 0 && !this.stopSearch');
            this.stopEvent(event);
            this.searchList.hidden = true;

            // [Goalous Fix] original fix to support to insert mention html when selected mention item
            // value is inserted without a trailing space for consistency
            // between element types (div and iframe do not preserve the space)
            // insertValue(nativeElement, this.startPos, pos,
            //   this.activeConfig.mentionSelect(this.searchList.activeItem), this.iframe);
            // If Android, last input character remain, so should substr include margin character.
            this.insertHtml(this.activeConfig.mentionSelect(this.searchList.activeItem), this.startPos, pos);
            document.execCommand('insertHTML', false, '&nbsp;');
            if (this.isComposing && event.wasClick && !this.isAndroid) {
              nativeElement.blur();
              this.isComposing = false;
            }
            this.addEventForRemoveMention();
            this.selectedMention.emit(this.searchList.activeItem);

            // Reset items
            this.resetSearchList();

            // [Goalous Fix] Comment out becuase this cause web page crash
            // fire input event so angular bindings are updated
            // if ('createEvent' in document) {
            //   const evt = document.createEvent('HTMLEvents');
            //   evt.initEvent('input', false, true);
            //
            //   nativeElement.dispatchEvent(evt);
            // }

            this.startPos = -1;
            return false;
          }
          else if (charCode === KEY_ESCAPE) {
            this.stopEvent(event);
            this.searchList.hidden = true;
            this.stopSearch = true;
            return false;
          }
          else if (charCode === KEY_DOWN) {
            this.stopEvent(event);
            this.searchList.activateNextItem();
            return false;
          }
          else if (charCode === KEY_UP) {
            this.stopEvent(event);
            this.searchList.activatePreviousItem();
            return false;
          }
        }

        if (charCode === KEY_LEFT || charCode === KEY_RIGHT) {
          this.stopEvent(event);
          return false;
        } else if (!this.stopSearch) {
          console.log('--- search start!');
          let mention = val.substring(this.startPos + 1, pos);
console.log({mention});
          if (!this.isPcSafari && (charCode !== KEY_BACKSPACE && imeInputStatus === IME_INPUT_STATUS.NONE) && !this.isAndroid) {
            mention += charPressed;
console.log('add charPressed:' + mention);
          }

          if (mention.length > 0) {
            this.searchString = mention;
            this.searchTerm.emit(this.searchString);
            this.updateSearchList();
          } else {
            this.searchList.items = [];
          }
        }
      }
    }
  }

  insertHtml(html, startPos, endPos) {
    let range = void 0,
      sel = void 0;
    sel = window.getSelection();
    range = document.createRange();
    range.setStart(sel.anchorNode, startPos);
    range.setEnd(sel.anchorNode, endPos);
    range.deleteContents();

    const el = document.createElement('div');
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node = void 0,
      lastNode = void 0;
    while (node = el.firstChild) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);

    // Preserve the selection
    if (lastNode) {
      range = range.cloneRange();
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  resetSearchList() {
    if (this.activeConfig) {
      this.stopSearch = true;
      this.activeConfig.items = [];
      this.searchList.items = [];
      this.searchList.hidden = true;
    }
  }

  updateSearchList(changeSearchListHidden = true) {
    let matches: any[] = [];
    if (this.activeConfig && this.activeConfig.items) {
      // let objects = this.activeConfig.items;
      // disabling the search relies on the async operation to do the filtering
      // if (!this.disableSearch && this.searchString) {
      //   const searchStringLowerCase = this.searchString.toLowerCase();
      //   objects = objects.filter(e => e[this.activeConfig.labelKey].toLowerCase().startsWith(searchStringLowerCase));
      // }
      matches = this.activeConfig.items;
      if (this.activeConfig.maxItems > 0) {
        matches = matches.slice(0, this.activeConfig.maxItems);
      }
    }
    // update the search list
    if (this.searchList) {
      this.searchList.labelKey = this.activeConfig.labelKey;
      this.searchList.items = matches;
      if (changeSearchListHidden) {
        this.searchList.hidden = matches.length === 0;
      }
    }
  }
  appendComponentToBody(): ComponentRef<MentionListComponent> {
    const componentRef = this._componentResolver
      .resolveComponentFactory(MentionListComponent)
      .create(this.injector);
    this.appRef.attachView(componentRef.hostView);
    const domElem = (componentRef.hostView as EmbeddedViewRef<any>)
      .rootNodes[0] as HTMLElement;
    // Append to body or wherever you want
    document.body.appendChild(domElem);
    return componentRef;
  }
  showSearchList(nativeElement: HTMLInputElement) {
    if (this.searchList == null) {
      const componentRef = this.appendComponentToBody();
      this.searchList = componentRef.instance;
      this.searchList.position(nativeElement, this.iframe, this.activeConfig.dropUp);
      this.searchList.itemTemplate = this.mentionListTemplate;
      componentRef.instance['itemClick'].subscribe(() => {
        nativeElement.focus();
        const fakeKeydown = {'keyCode': KEY_ENTER, 'wasClick': true};
        this.keyHandler(fakeKeydown, nativeElement);
      });
    }
    else {
      this.searchList.labelKey = this.activeConfig.labelKey;
      this.searchList.activeIndex = 0;
      this.searchList.position(nativeElement, this.iframe, this.activeConfig.dropUp);
      window.setTimeout(() => this.searchList.resetScroll());
    }
  }
}
