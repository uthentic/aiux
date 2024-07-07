<script setup>

import { ref, computed, watch, onMounted, nextTick } from 'vue'

var app = this;
const content = defineModel();
const props = defineProps({
    label: {
        type: String,
        default: ''
    },
    placeholder: {
        type: String,
        default: ''
    },
    maxRows: {
        type: String,
        default: ''
    },
    minRows: {
        type: String,
        default: ''
    },
    rows: {
        type: String,
        default: ''
    },
    borderless: {
        type: String,
        default: 'false'
    },
    selectionSettings: {
        type: Object,
        default: () => {
            return {
                /*
                * The default value for the selection settings
                * autoSelect: "word" - selects the word under the cursor
                * autoSelect: "sentence" - selects the sentence under the cursor
                * autoSelect: "paragraph" - selects the paragraph under the cursor
                */
                autoSelect: "word"
            }
        }
    }
});

const emit = defineEmits([
    "focus",
    "blur",
    "text-selected",
    "change"
]);

const borderlessClass = computed(() => {
    return props.borderless === 'true' ? "borderless" : "";
});
const isFocused = ref(false);
const contentRef = ref(null);

function focused(event) {
    isFocused.value = true;
    emit("focus");
}

function blurred(event) {
    isFocused.value = false;
    emit("blur");
}

function syncContentToDocument() {
    if (content.value === null || content.value === undefined)
        contentRef.value.innerText = "";
    else if (contentRef.value.innerText !== content.value)
        contentRef.value.innerText = content.value;
}

function syncDocumentToContent() {

    content.value = contentRef.value.innerText;
}

async function contentChanged(event) {
    console.log(content.value);
    console.log(event);

    var before = content.value;
    var after = contentRef.value.innerText;
    
    syncDocumentToContent();
    fixScroll();

    if (before != after)
        emit("change", {before, after});
}

function fixScroll() {
    return;
    if (window.getSelection().rangeCount == 0)
        return;

    var cursorBottom = window.getSelection().getRangeAt(0).getBoundingClientRect().bottom;
    var bottom = window.innerHeight;
    var padding = 50;
    if (cursorBottom + padding > bottom) {
        var scrollPosition = window.scrollY;
        var distanceToScroll = (cursorBottom + padding) - bottom;
        window.scrollTo(window.scrollX, scrollPosition + distanceToScroll)
    }
}

function pasted(event) {
    if (window.getSelection().rangeCount == 0)
        return;

    var cursorStart = window.getSelection().getRangeAt(0).getBoundingClientRect().bottom;

    // setTimeout(() => {
    //     var cursorEnd = window.getSelection().getRangeAt(0).getBoundingClientRect().bottom;
    //     var distance = cursorEnd - cursorStart;
    //     window.scrollTo(window.scrollX, window.scrollY + distance);
    // }, 0);

    contentChanged(event);
}

function focus() {
    contentRef.value.focus();
}

function placeholderFocused() {
    focus();
}


watch(content, (newValue, oldValue) => {
    syncContentToDocument();
});

onMounted(() => {
    syncContentToDocument();


    // if(props.rows){
    //     props.minRows = props.rows;
    //     props.maxRows = props.rows;
    // }

    // if (props.minRows > 0)
    //     contentRef.value.style.minHeight = (props.minRows * 1.4) + 1 + "rem";

    // if (props.maxRows > 0)
    //     contentRef.value.style.maxHeight = (props.maxRows * 1.4) + 1 + "rem";
});

function getContenteditable() {
    return contentRef.value;
}

function getSelection() {
    var cursor = window.getSelection().getRangeAt(0);

    if (!isFocused.value)
        return null;

    return cursor;

    // if(cursor.startOffset !== cursor.endOffset) {
    //     console.log("Selection present, not splitting bullets.")
    //     return;
    // }
}

function getSelectedText() {
    var cursor = window.getSelection().getRangeAt(0);

    if (!isFocused.value)
        return null;

    return cursor.toString();
}

function getCursorPosition() {
    var cursor = window.getSelection().getRangeAt(0);
    console.log(cursor);

    if (!isFocused.value)
        return null;

    return cursor.startOffset;
}

function setCursorPosition(pos) {
    focus();
    var range = document.createRange();
    var sel = window.getSelection();

    if (contentRef.value.childNodes.length == 0)
        return;

    range.setStart(contentRef.value.childNodes[0], Math.min(pos, contentRef.value.childNodes[0].data.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function expandSelectionToWord() {
    var selRange = window.getSelection().getRangeAt(0);

    while (true) {
        //if the selection is at the beginning of the paragraph, break
        if (selRange.startOffset === 0)
            break;

        //if the character before the selection is a non-word character, break
        if (selRange.startContainer.data[selRange.startOffset - 1].match(/\W/))
            break;

        selRange.setStart(selRange.startContainer, selRange.startOffset - 1);
    }

    while (true) {
        //if the selection is at the end of the paragraph, break
        if (selRange.endOffset === selRange.endContainer.data.length)
            break;

        //if the character after the selection is a non-word character, break
        if (selRange.endContainer.data[selRange.endOffset].match(/\W/))
            break;

        selRange.setEnd(selRange.endContainer, selRange.endOffset + 1);
    }
}

function expandSelectionToParagraph() {
    var selRange = window.getSelection().getRangeAt(0);

    while (true) {
        //if the selection is at the beginning of the paragraph, break
        if (selRange.startOffset === 0)
            break;

        selRange.setStart(selRange.startContainer, selRange.startOffset - 1);
    }

    while (true) {
        //if the selection is at the end of the paragraph, break
        if (selRange.endOffset === selRange.endContainer.data.length)
            break;

        selRange.setEnd(selRange.endContainer, selRange.endOffset + 1);
    }
}

//bug: if you end on a sentence end character or a quote, it will include the next sentence
function expandSelectionToSentence() {
    var selRange = window.getSelection().getRangeAt(0);

    var sentenceEnd = /[.!?]/;

    while (true) {
        //if the selection is at the beginning of the paragraph, break
        if (selRange.startOffset === 0)
            break;

        //if the character before the selection is a sentence end character, break
        if (selRange.startContainer.data[selRange.startOffset - 1].match(sentenceEnd)) {
            while (selRange.toString().match(/^\s/)) {
                selRange.setStart(selRange.startContainer, selRange.startOffset + 1);
            }

            break;
        }

        selRange.setStart(selRange.startContainer, selRange.startOffset - 1);
    }

    var isQuote = selRange.toString().match(/^"/);

    while (true) {
        //if the selection is at the end of the paragraph, break
        if (selRange.endOffset === selRange.endContainer.data.length)
            break;

        //if the character after the selection is a quote, AND the selection DOES NOT start with a quote, break
        if (selRange.endContainer.data[selRange.endOffset] === '"' && !isQuote) {
            //do not end with a comma or a whitespace character
            while (selRange.toString().match(/[, ]$/)) {
                selRange.setEnd(selRange.endContainer, selRange.endOffset - 1);
            }
            break;
        }

        //if the character after the selection is a sentence end character, break
        if (selRange.endContainer.data[selRange.endOffset].match(sentenceEnd)) {
            //include the sentence end character in the selection
            selRange.setEnd(selRange.endContainer, selRange.endOffset + 1);

            //if the next character is a quote, AND the selection starts with a quote, include it in the selection
            if (selRange.endContainer.data[selRange.endOffset] === '"' && isQuote) {
                selRange.setEnd(selRange.endContainer, selRange.endOffset + 1);
            }

            break;
        }

        selRange.setEnd(selRange.endContainer, selRange.endOffset + 1);
    }

}

function normalizeSelectionToText() {
    var container = contentRef.value;
    var selRange = window.getSelection().getRangeAt(0);
    var nodes = container.childNodes;

    if (container == selRange.startContainer) {
        var index = selRange.startOffset;
        while (index < nodes.length) {
            if (nodes[index].nodeType === 3) {
                selRange.setStart(nodes[index], 0);
                break;
            }
            index++;
        }
    }

    if (container == selRange.endContainer) {
        var index = selRange.endOffset;
        while (index >= 0) {
            if (nodes[index].nodeType === 3) {
                selRange.setEnd(nodes[index], nodes[index].data.length);
                break;
            }
            index--;
        }
    }
}

function restoreSelection(selection) {
    var newRange = document.createRange();
    newRange.setStart(selection.startNode(), selection.startOffset);
    newRange.setEnd(selection.endNode(), selection.endOffset);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);
}

function saveSelection(selRange) {
    var startContainerIndex = -1;
    var endContainerIndex = -1;


    var container = contentRef.value;

    for (var i = 0; i < container.childNodes.length; i++) {
        if (container.childNodes[i] === selRange.startContainer) {
            startContainerIndex = i;
        }

        if (container.childNodes[i] === selRange.endContainer) {
            endContainerIndex = i;
        }
    }

    var selection = {
        startOffset: selRange.startOffset,
        endOffset: selRange.endOffset,
        startContainerIndex: 0,
        endContainerIndex: 0,
        startNode: () => startContainerIndex == -1 ? contentRef.value : contentRef.value.childNodes[startContainerIndex],
        endNode: () => endContainerIndex == -1 ? contentRef.value : contentRef.value.childNodes[endContainerIndex]
    };

    return selection;
}


async function mouseup() {
    var selRange = window.getSelection().getRangeAt(0);

    await nextTick();

    if (selRange.startOffset !== selRange.endOffset) {
        var originalContent = contentRef.value.innerText;
        var selection = saveSelection(selRange);

        normalizeSelectionToText();

        if (selRange.toString().trim().length == 0) {
            restoreSelection(selection);
            return;
        }

        if (props.selectionSettings.autoSelect === "word")
            expandSelectionToWord();
        else if (props.selectionSettings.autoSelect === "paragraph")
            expandSelectionToParagraph();
        else if (props.selectionSettings.autoSelect === "sentence")
            expandSelectionToSentence();

        selection = saveSelection(selRange);





        var before = selRange.startContainer.data.substring(0, selRange.startOffset);
        var after = selRange.startContainer.data.substring(selRange.endOffset);
        var highlighted = selRange.toString();
        var paragraph = before + highlighted + after;

        var span = document.createElement("span");
        span.addClass = "highlighted";

        try {
            selRange.surroundContents(span);
        }
        catch (e) {
            console.log(e);
        }

        //prepend the text "<mark>" to the span and append the text "</mark>" to the span
        var start = document.createTextNode("<mark>");
        var end = document.createTextNode("</mark>");
        span.prepend(start);
        span.append(end);


        var fullContentMarked = contentRef.value.innerText;
        start.remove();
        end.remove();
        span.remove();
        contentRef.value.innerText = originalContent;

        var result = {
            text: highlighted,
            paragraph: paragraph,
            element: span,
            fullContentMarked: fullContentMarked,
        };

        restoreSelection(selection);


        //now get all the content before and after the cursor





        emit("text-selected", result);
    }

}

defineExpose({
    isFocused,
    getContenteditable,
    focus,
    getSelection,
    getCursorPosition,
    setCursorPosition,
    getSelectedText
});

</script>

<template>
    <div class="u-textarea">
        <div v-if="$slots.label || label?.length" class="label" @click="focus()">
            <slot name="label">{{ label }}</slot>
        </div>
        <div class="u-textarea-wrapper" :class="borderlessClass">

            <div style="height: 0; overflow: visible;">
                <div v-if="!content?.length" class="u-textarea-content" placeholder contenteditable="plaintext-only"
                    @focus="placeholderFocused()">{{ placeholder }}</div>
            </div>
            <div class="u-textarea-content" ref='contentRef' @focus="focused($event)" @blur="blurred($event)"
                @paste="pasted($event)" @input="contentChanged($event)" contenteditable="plaintext-only"
                @mouseup="mouseup()"></div>
        </div>
    </div>
</template>

<style></style>

<style scoped>

.u-textarea {
  
    --padding-y: var(--sl-spacing-x-small);
    --padding-x: var(--sl-spacing-medium);
    --margin-start: var(--sl-spacing-x-small);
    --min-rows: v-bind(minRows);
    --max-rows: v-bind(maxRows);
    --line-height: 1.4em;

     /* --min-height: ; */
     /* --max-height: ; */
    /* --min-height: calc(var(--min-rows) * 1.4rem + (var(calc(--padding-y * 1px)) * 2)); */
}


.u-textarea .u-textarea-content {
    flex: 1 1 auto;
    line-height: var(--line-height);
    color: var(--sl-input-color);
    border: none;
    background: none;
    box-shadow: none;
    cursor: inherit;
    appearance: none;
    min-height: calc(var(--min-rows) * var(--line-height) + var(--padding-y) * 2);
    max-height: calc(var(--max-rows) * var(--line-height) + var(--padding-y) * 2);
    width: 100%;
    padding-top: var(--padding-y);
    padding-bottom: var(--padding-y);
    padding-right: var(--padding-x);
    padding-left: var(--padding-x);
    overflow: auto;
}


.u-textarea .label {
    font-weight: 400;
    cursor: default;
}

.u-textarea  .u-textarea-content[placeholder] {
    color: var(--sl-input-placeholder-color);
    cursor: text;
}

.u-textarea  .u-textarea-content:focus {
    outline: 0px solid transparent;
}

.u-textarea  .textarea__control {
    flex: 1 1 auto;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: 1.4;
    color: var(--sl-input-color);
    border: none;
    background: none;
    box-shadow: none;
    cursor: inherit;
    appearance: none;
}

.u-textarea  .u-textarea-wrapper:focus-within {
    background-color: var(--sl-input-background-color-focus);
    border-color: var(--sl-input-border-color-focus);
    color: var(--sl-input-color-focus);
    box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);

}

.u-textarea  .u-textarea-wrapper {
    align-items: center;
    position: relative;
    width: 100%;
    font-family: var(--sl-input-font-family);
    font-weight: var(--sl-input-font-weight);
    line-height: var(--sl-line-height-normal);
    letter-spacing: var(--sl-input-letter-spacing);
    vertical-align: middle;
    transition: var(--sl-transition-fast) color, var(--sl-transition-fast) border, var(--sl-transition-fast) box-shadow, var(--sl-transition-fast) background-color;
    cursor: text;
    background-color: var(--sl-input-background-color);
    border: solid var(--sl-input-border-width) var(--sl-input-border-color);
    border-radius: var(--sl-input-border-radius-medium);
    font-size: var(--sl-input-font-size-medium);
}

.u-textarea  .u-textarea-wrapper.borderless {
    border: none;
}

.u-textarea  .textarea--standard.textarea--focused {
    background-color: var(--sl-input-background-color-focus);
    border-color: var(--sl-input-border-color-focus);
    color: var(--sl-input-color-focus);
    box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);
}
</style>
