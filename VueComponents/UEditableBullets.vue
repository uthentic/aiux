<script setup>

import { ref, computed, watch, nextTick, defineProps, defineModel, defineEmits, defineExpose } from 'vue';
import UTextarea from '../components/UTextarea.vue';
import * as ai from '../assets/uthentic-ai.js';
import ButtonOptionsList from './ButtonOptionsList.vue';


const props = defineProps({
    purpose: {
        type: String,
        default: "a new project I'm working on"
    },
    depth: {
        type: Number,
        default: () => 0
    },
    context: {
        type: String,
        default: null
    }
});

const emit = defineEmits([
    'update'
]);

/**
 * @typedef {Object} Bullet
 * @property {string} text
 * @property {Bullet[]} children
 */
const bulletsText = defineModel();
const bullets = ref([]);
const bulletRefs = ref({});
const bulletAI = ref({});
const markdown = computed(() => renderBulletPoints(bullets.value));
const busy = ref({});
var bulletLookup = {};
var latestVersion = null;

watch(bulletsText, initBulletPoints);

function initBulletPoints() {
    if(latestVersion == bulletsText.value)
    {
        console.log("no change");
        return;
    }

    var flat = parseBulletPointsFlat(bulletsText.value);
    bullets.value = flat;
    saveBulletPoints();
}

initBulletPoints();

function updateBulletIndexes() {
    bulletLookup = {};
    bullets.value.forEach((bullet, i) => {
        bullet.index = i;
        bulletLookup[bullet.text] = bullet;
    });
}

function saveBulletPoints() {
    var md = markdown.value;
    if (md != bulletsText.value) {
        latestVersion = md;
        bulletsText.value = md;
        emit('update', md);
        updateBulletIndexes();
    }
}


function parseBulletPointsFlat(myBulletsText) {
    var items = ai.parseBulletPoints(myBulletsText);

    var q = [...items];
    var flat = [];
    var index = 0;

    while (q.length > 0) {
        var item = q.shift();
        item.id = ai.randomString();
        item.index = index++;

        flat.push(item);

        if (item.children) {
            //item.children.forEach(x => x.parent = item);
            q.unshift(...item.children);
            //delete item.children;
        }
    }

    return flat;
}

function renderBulletPoints(bulletPoints, mark) {
    if (!bulletPoints?.length)
        return "";

    var result = "";

    bulletPoints.forEach(bp => {
        if(mark == bp)
        {
            result += "<mark>";

        }

        result += "\t".repeat(bp.level) + "- " + bp.text;

        if(mark == bp)
        {
            result += "</mark>";
        }

        result += "\n";
    });

    return result;

}


async function newEntry(index) {
    return;
    var bullet = bullets.value[index];
    bullet.text = "$$NEW_ENTRY$$";
    var bulletsMD = toMarkdown();
    bullet.text = "";

    if (!bulletAI.value[bullet.id]) {
        bulletAI.value[bullet.id] = { themes: [] };
    }

    var response = await ai.streamFlowXML("flow://yxsWazOpNSeqKi7H", {
        "$vars": {
            "bulletedList": bulletsMD,
            "context": props.context
        },
        "theme": x => bulletAI.value[bullet.id].themes = x.values
    });

    bulletAI.value[bullet.id].themesResponse = response;
}


async function makeGuess(index, theme) {
    var bullet = bullets.value[index];

    if (!theme) {
        bulletAI.value[bullet.id].guesses = null;
        return;
    }

    var bulletsMD = toMarkdown();
    var responses = { 254: bulletAI.value[bullet.id].themesResponse };

    await ai.streamFlowXML("flow://LceDTK0k7Wo9MAc0", {
        "$vars": {
            "bulletedList": bulletsMD,
            "context": props.context,
            "theme": theme,
        },
        "$responses": responses,
        "guess": x => bulletAI.value[bullet.id].guesses = x.values
    });
}

function selectGuess(index, guess) {
    bullets.value[index].text = guess;
    bulletAI.value[bullets.value[index].id] = null;

}

// //history
// var compHistory = [{bullets: toMarkdown(), cursor: null}];
// var compHistoryIndex = 0;
// var ignoreChange = null;
// async function redo() {
//     if(props.depth > 0)
//         return;
//     if(compHistoryIndex < compHistory.length - 1) {
//         compHistoryIndex++;
//         var historyItem = compHistory[compHistoryIndex];
//         var json = historyItem.bullets;
//         ignoreChange = json;
//         bullets.value = JSON.parse(json);

//         var cursor = historyItem.cursor;

//         if(cursor) {
//             await nextTick();
//             cursor.ref.setCursorPosition(cursor.position);
//         }
//     }
// }

// async function undo() {
//     if(props.depth > 0)
//         return;

//     if(compHistoryIndex > 0) {
//         compHistoryIndex--;
//         var historyItem = compHistory[compHistoryIndex];
//         var json = historyItem.bullets;
//         ignoreChange = json;
//         bullets.value = JSON.parse(json);

//         var cursor = historyItem.cursor;

//         if(cursor) {
//             await nextTick();
//             cursor.ref.setCursorPosition(cursor.position);
//         }



//     }
// }

// watch(bullets, (newVal, oldVal) => {
//     var json = JSON.stringify(newVal);
//     console.log(ignoreChange == json, ignoreChange, json);
//     if(ignoreChange == json) {
//         ignoreChange = null;
//         return;
//     }

//     // get the current cursor position
//     var cursorRef = getFocusedRef();

//     compHistory.push({
//         bullets: json,
//         cursor: cursorRef == null ? null : {
//             ref: cursorRef,
//             position: cursorRef?.getCursorPosition()
//         }
//     });

//     compHistoryIndex = compHistory.length - 1;
//     console.log("compHistory", compHistory);

//     if(compHistory.length > 200) {
//         compHistory.shift();
//     }
// }, {deep: true});

async function onEscape(bullet, event) {
    console.log("onEscape", bullet);

    if(bullet.isPending)
    {
        rejectAISuggestion(bullet);
        return;
    }
}

async function onEnter(bullet, event) {

    if(bullet.isPending)
    {
        acceptAISuggestion(bullet);
        return;
    }

    var bulletIndex = bullet.index;

    var ref = bulletRefs.value[bullet.id].text;

    if (!ref.isFocused) {
        console.log("Not focused, not splitting bullets.")
        return;
    }

    console.log(window.getSelection().getRangeAt(0));
    var cursor = ref.getSelection();

    if (cursor.startOffset !== cursor.endOffset) {
        console.log("Selection present, not splitting bullets.")
        return;
    }

    var cursorPosition = cursor.startOffset;
    console.log("cursorPosition", cursorPosition);

    var text = event.target.innerText;
    //get the text after the cursor
    var textAfterCursor = text.substring(cursorPosition).trim();
    console.log("textAfterCursor", textAfterCursor);
    //get the text before the cursor
    var textBeforeCursor = text.substring(0, cursorPosition).trim();
    console.log("textBeforeCursor", textBeforeCursor);

    //set the current bullet to the text before the cursor
    bullet.text = textBeforeCursor;

    //add a new bullet with the text after the cursor
    bullets.value.splice(bulletIndex + 1, 0, {
        text: textAfterCursor,
        children: [],
        id: ai.randomString(),
        level: bullet.level
    });
    
    saveBulletPoints();
    await nextTick();

    focus(bullets.value[bulletIndex + 1]);

    if (textAfterCursor == "") {
        newEntry(bulletIndex + 1);
    }
}

function getTextRefFromIndex(index) {
    var bullet = bullets.value[index];
    return bulletRefs.value[bullet.id].text;
}

function getTextRef(bullet) {
    return bulletRefs.value[bullet.id].text;
}

function setTextRef(el, bullet) {
    bulletRefs.value[bullet.id] = bulletRefs.value[bullet.id] || {};
    bulletRefs.value[bullet.id].text = el;
}


async function onBackspace(bullet, event) {
    var bulletIndex = getIndex(bullet);

    var ref = getTextRefFromIndex(bulletIndex);
    if (!ref.isFocused) {
        console.log("Not focused, not splitting bullets.")
        return;
    }

    var cursor = ref.getSelection();
    if (cursor.startOffset !== cursor.endOffset) {
        console.log("Selection present, not splitting bullets.")
        return;
    }

    var cursorPosition = cursor.startOffset;

    if (cursorPosition != 0) {
        return;
    }


    var i = bulletIndex;
    var p = bulletIndex - 1;
    cursorPosition = bullets.value[p].text.length + 1;

    if (bulletIndex > 0) {
        var text = bullets.value[p].text + " " + bullets.value[i].text;
        bullets.value[p].text = text;
        await nextTick();
        ref = getTextRefFromIndex(p);
        ref.focus();
        ref.setCursorPosition(cursorPosition);
    }

    bullets.value.splice(bulletIndex, 1);

    console.log("cursorPosition", cursorPosition);

    //prevent the default behavior of the backspace key
    event.preventDefault();
}

async function shiftBulletDownOneSlot(bullet) {
    var children = getChildren(bullet);
    var index = bullet.index;
    var baseLevel = bullet.level;
    var all = bullets.value.splice(bullet.index, children.length + 1);
    
    var next = bullets.value[index];

    if(next === undefined)
    {
        //we are already at the end of the list, can't shift down
        insertBullet(index, all);
        return;
    }

    if(next.level < baseLevel)
    {
        insertBullet(index, all);
        return;
    }

    var insertIndex = index + getChildrenByIndex(index).length + 1;
    insertBullet(insertIndex, all);
    saveBulletPoints();
}

async function shiftBulletUpOneSlot(bullet) {
    var bulletIndex = bullet.index;
    if (bulletIndex == 0) {
        return;
    }

    var level = bullets.value[bulletIndex].level;


    var prevIndex = getParentIndex(bulletIndex - 1, level);
    if (prevIndex == -1) {
        return;
    }

    var prev = bullets.value[prevIndex];
    await shiftBulletDownOneSlot(prev);

}

async function movePrevious(bullet, event) {
    var bulletIndex = getIndex(bullet);
    var ref = getTextRefFromIndex(bulletIndex);
    var currentPosition = ref.getCursorPosition();

    //move the bullets up when alt is held
    if (event.altKey) {
        shiftBulletUpOneSlot(bullet);

        await nextTick();
        getTextRef(bullet).focus();
        return;
    }
    
    //if it's the last bullet, but not the only bullet, and the current bullet is empty, remove the current bullet
    if (bulletIndex == bullets.value.length - 1 && bullets.value.length > 1 && bullet.text.trim() == "") {
        bullets.value.pop();
        await nextTick();
        getTextRefFromIndex(bulletIndex - 1).setCursorPosition(0);
    }
    //focus the previous bullet
    else if (bulletIndex > 0) {

        var refPrev = getTextRefFromIndex(bulletIndex - 1);
        refPrev.focus();

        //if the cursor is at the end of the current bullet, set the cursor position to the end in the previous bullet
        if (currentPosition == bullets.value[bulletIndex].text.length) {
            refPrev.setCursorPosition(bullets.value[bulletIndex - 1].text.length);
        }
        else {
            //set the cursor position to 'currentPosition' in the previous bullet
            refPrev.setCursorPosition(currentPosition);
        }

        //prevent the default behavior of the arrow up key
        event.preventDefault();
    }

    //if it's the first bullet, add a new bullet at the beginning
    else if (bulletIndex == 0 && bullet.text.trim() != "") {
        bullets.value.unshift({
            text: "",
            level: 0,
            children: [],
            id: ai.randomString(),
            index: 0
        });
        saveBulletPoints();
        await nextTick();
        getTextRefFromIndex(bulletIndex).focus();
    }
}

async function moveNext(bullet, event) {
    var bulletIndex = getIndex(bullet);
    var ref = getTextRefFromIndex(bulletIndex);
    var currentPosition = ref.getCursorPosition();

    console.log(currentPosition);

    //if it's the first bullet, but not the only bullet, and the current bullet is empty, remove the current bullet
    if (bulletIndex == 0 && bullets.value.length > 1 && bullets.value[bulletIndex].text.trim() == "") {
        bullets.value.shift();
        saveBulletPoints();
        await nextTick();
        getTextRefFromIndex(bulletIndex).focus();
    }

    //focus the next bullet
    else if (bulletIndex < bullets.value.length - 1) {
        if (event.altKey) {
            shiftBulletDownOneSlot(bullet);
            await nextTick();
            getTextRef(bullet).focus();
            return;
        }

        var ref2 = getTextRefFromIndex(bulletIndex + 1);
        ref2.focus();

        //if the cursor is at the end of the current bullet, set the cursor position to the end in the next bullet
        if (currentPosition == bullets.value[bulletIndex].text.length) {
            ref2.setCursorPosition(bullets.value[bulletIndex + 1].text.length);
        }
        else {
            //set the cursor position to 'currentPosition' in the next bullet
            ref2.setCursorPosition(currentPosition);
        }

        //prevent the default behavior of the arrow down key
        event.preventDefault();
    }

    //if it's the last bullet
    else if (bulletIndex == bullets.value.length - 1) {

        //if the last bullet is empty and it's level is greater than 0, reduce the level
        if(bullet.text.trim() == "")
        {
            if(bullet.level > 0)
                bullet.level--;

            saveBulletPoints();
            return;
        }
        else
        {
            bullets.value.push({
                text: "",
                level: bullet.level,
                children: [],
                id: ai.randomString(),
                index: bullets.value.length
            });
            saveBulletPoints();
            await nextTick();
            getTextRefFromIndex(bulletIndex + 1).focus();
        }
    }

    
}

function getParentIndex(bullet, parentLevel) {
    var bulletIndex = getIndex(bullet);
    var level = bullets.value[bulletIndex].level;

    if (parentLevel === null || parentLevel === undefined || parentLevel < 0)
        parentLevel = level - 1;

    if (parentLevel < 0)
        parentLevel = 0;

    if (level == parentLevel)
        return bulletIndex;

    if (level < parentLevel)
        return -1;

    while (bulletIndex > 0) {
        bulletIndex--;
        if (bullets.value[bulletIndex].level == parentLevel)
            return bulletIndex;

    }

    return 0;
}

function insertBullet(bulletIndex, items) {

    if(!Array.isArray(items))
        items = [items];
    
    bullets.value.splice(bulletIndex, 0, ...items);
}

function getChildren(bullet) {
    return getChildrenByIndex(bullet.index);
}

function getChildrenByIndex(bulletIndex) {
    var level = bullets.value[bulletIndex].level;
    var children = [];
    for (var i = bulletIndex + 1; i < bullets.value.length; i++) {
        if (bullets.value[i].level <= level)
            break;

        children.push(bullets.value[i]);
    }

    return children;
}



async function onTab(bullet, event) {
    var bulletIndex = getIndex(bullet);
    if (bulletIndex == 0) {
        return;
    }

    //return if event has a shift key
    if (event.shiftKey) {
        return;
    }


    var bullet = bullets.value[bulletIndex];
    var previousBullet = bullets.value[bulletIndex - 1];
    if (bullet.level > previousBullet.level) {
        return;
    }

    var toShift = [bullet];

    //move down the list of bullets until the level is less than or equal to the current bullet
    for (var i = bulletIndex + 1; i < bullets.value.length; i++) {
        var b = bullets.value[i];
        if (b.level <= bullet.level) {
            break;
        }

        toShift.push(b);
    }

    //shift the bullets
    for (var i = 0; i < toShift.length; i++) {
        toShift[i].level++;
    }

    saveBulletPoints();
}

function focus(bullet, cursorPosition) {
    cursorPosition = cursorPosition || 0;
    bulletRefs.value[bullet.id].text.setCursorPosition(cursorPosition);
}

function onShiftTab(bullet) {
    var bulletIndex = getIndex(bullet);
    if (bulletIndex == 0) {
        return;
    }

    var bullet = bullets.value[bulletIndex];

    if (bullet.level == 0)
        return;

    var toShift = [bullet];


    var index = bulletIndex + 1;
    //move down the list of bullets until the level is less than or equal to the current bullet
    for (index = bulletIndex + 1; index < bullets.value.length; index++) {
        var b = bullets.value[index];
        if (b.level <= bullet.level) {
            break;
        }

        toShift.push(b);
    }

    while (index < bullets.value.length && bullets.value[index].level >= bullet.level) {
        index++;
    }

    var distanceToShift = index - bulletIndex;

    //shift the bullets
    for (var i = 0; i < toShift.length; i++) {
        toShift[i].level--;
    }

    //remove all the items in toShift with a single splice
    bullets.value.splice(bulletIndex, toShift.length);

    //insert toShift into bullets at bulletIndex + distanceToShift - toShift.length
    bullets.value.splice(bulletIndex + distanceToShift - toShift.length, 0, ...toShift);

    saveBulletPoints();

}

function getFocusedRef() {
    var ref = bulletRefs.value.find(x => x.text?.isFocused);
    if (ref) {
        return ref.text;
    }

    return null;

}

function onBlur(bullet) {
    var index = getIndex(bullet);
    //bullets.value[index].isFocused = false;
    // var text = bullets.value[index].text;
    // if(text.trim() == "") {
    //     bullets.value.splice(index, 1);
    // }
}

const currentFocusBullet = ref(null);

function onFocus(bullet) {
    console.log("onFocus", bullet);
    currentFocusBullet.value = bullet;
}

const startNodeIndex = ref(null);
const startNode = computed(() => startNodeIndex.value === null ? null : bullets.value[startNodeIndex.value]);

function getIndex(bullet) {
    return bullet.index ?? bullet;
}

function setStartNode(bullet){


    if(bullet === null)
    {
        startNodeIndex.value = null;
        return;
    }

    bullet.suggestions = [];
    bullet.busy = {};

    console.log("Setting start node", bullet);
    if(startNodeIndex.value === bullet.index)
        startNodeIndex.value = null;
    else
    {
        startNodeIndex.value = bullet.index;
    }

    generateQuestionTopics(bullet);
    generateSuggestions();
}

defineExpose({
    focus,
    bulletRefs,
    getFocusedRef
});

async function selectQuestionTopic(bullet, topic){
    topic = topic.value || topic;
    bullet.selectedTopic = topic;
    generateQuestions(bullet, topic);
}



function selectAnswer(bullet, question, answer){
    //make sure the answer is a bulleted list, by checking to see if all lines start with -
    if(ai.isBulletedList(answer))
    {
        //parse the answer into a bulleted list
        var answers = ai.parseBulletPoints(answer);
        
        //then turn the answer from a bulleted list back into a string
        answer = ai.renderBulletPoints(answers);

        //we do this to ensure that the answer is formatted correctly
    }




    question.answer = answer;
}

function saveQuestionAnswer(bullet, question, answer) {

    bullet = bullet || startNode.value;

    //get the index of the last child of the startNode
    var children = getChildren(bullet);
    var index = bullet.index + children.length;

    // if(currentFocusBullet.value)
    //     index = getParentIndex(currentFocusBullet.value, bullet.level + 1);
    
    var flatBullets = parseBulletPointsFlat(answer);

    //offset flatBullets level by the level of the startNode
    flatBullets.forEach(x => x.level += bullet.level + 1);
    
    insertBullet(index + 1, flatBullets);

    //remove answer from question
    question.answers.splice(question.answers.indexOf(answer), 1);
    question.selectedAnswers.push(flatBullets);
    saveBulletPoints();
}

function clearQuestionAnswer(question) {
    question.answer = "";
}

async function generateQuestionTopics(bullet) {
    bullet = bullet || startNode.value;

    if(!bullet.topics){
        bullet.topics = {};
        bullet.topics.General = { topic: "General", isEssential: true, questions: {} };
        bullet.selectedTopic = bullet.topics.General;

        generateQuestions(bullet, bullet.topics.general);
    }

    //question topics
    //https://boook.azurewebsites.net/admin/flow/e4pJ9qOI8fT4
    await ai.streamFlowXML("flow://gFNH7B0jxDjo99or", {
        "$vars": {
            notesPurpose: props.purpose.value,
            notes: renderBulletPoints(bullets.value, bullet),
            header: bullet.text
        },
        "$busy": (x) => bullet.busy.topics = x,
        "essential": x => {
            //loop through x.values except for the last one. If x.isComplete is true, add the last value to the list
            var values = x.values;
            var topics = values.slice(0, values.length - 1);
            if (x.isComplete) {
                topics.push(values[values.length - 1]);
            }
            
            topics.forEach(topicName => {
                if (!bullet.topics[topicName]) {
                    bullet.topics[topicName] = { topic: topicName, isEssential: true, questions: {} };
                }
            });

        },
        "interesting": x => {
            //loop through x.values except for the last one. If x.isComplete is true, add the last value to the list
            var values = x.values;
            var topics = values.slice(0, values.length - 1);
            if (x.isComplete) {
                topics.push(values[values.length - 1]);
            }

            topics.forEach(topicName => {
                if (!bullet.topics[topicName]) {
                    bullet.topics[topicName] = { topic: topicName, isEssential: false, questions: {} };
                }
            });
        }
    });
}

async function regenerateQuestions(bullet, topic){
    topic.questions = {};
    generateQuestions(bullet, topic);

}
async function generateQuestions(bullet, topic) {
    bullet = bullet || startNode.value;
    topic = topic || bullet.selectedTopic;

    //questions
    //https://boook.azurewebsites.net/admin/flow/fRYYK1FwmXcZ
    await ai.streamFlowXML("flow://QkM4ovJEqPALcKzk", {
        "$vars": {
            notesPurpose: props.purpose.value,
            notes: renderBulletPoints(bullets.value, bullet),
            header: bullet.text,
            topic: topic.topic
        },
        "$busy": (x) => topic.busy = x,
        "question": x => {
            //loop through x.values except for the last one. If x.isComplete is true, add the last value to the list
            var values = x.values;
            var questions = values.slice(0, values.length - 1);
            if (x.isComplete) {
                questions.push(values[values.length - 1]);
            }
            
            if(questions)
            {
                questions.forEach(questionText => {
                    if (!topic.questions[questionText]) {
                        topic.questions[questionText] = { questionText: questionText, topic: topic.topic, selectedAnswers: [], answers: [] };
                    }
                });
            }
        }
    });
}

async function openQuestion(bullet, question){
    if(question.answers.length)
        return;

    generateAnswers(bullet, question);
}

async function generateAnswers(bullet, question) {

    //answers
    //https://boook.azurewebsites.net/admin/flow/SjzVyt7YFEIG
    await ai.streamFlowXML("flow://Px1BCYuinuxnEaLZ", {
        "$vars": {
            notesPurpose: props.purpose.value,
            notes: renderBulletPoints(bullets.value, bullet),
            header: bullet.text,
            topic: question.topic,
            question: question.questionText
        },
        "$busy": (x) => question.busy = x,
        "answer": x => question.answers = x.values,
    });
}

async function generateSuggestions(){
    if(!startNode.value.suggestions)
        startNode.value.suggestions = [];

    

    var nodeSuggestions = startNode.value.suggestions;
    var currentStartNode = startNode.value;
    currentStartNode.busy.suggestions = true;

    await ai.streamFlowXML("flow://v3uzum97UQ3QNbhb", {
        "$vars": {
            notesPurpose: props.purpose.value,
            notes: renderBulletPoints(bullets.value, startNode.value),
            header: startNode.value.text
        },
        "$busy": (x) => currentStartNode.busy.suggestions = x,
        "child": x => {
            x.values.forEach(suggestion => {
                var index = nodeSuggestions.findIndex(x => x.raw == suggestion);

                if(index == -1)
                {
                    
                    var text = suggestion.trim();
                    if(text.startsWith("-"))
                        text = text.substring(1).trim();

                    if(nodeSuggestions.length > 0)
                    {
                        //check to see if the last item in suggestions starts with suggestion
                        var last = nodeSuggestions[nodeSuggestions.length - 1];
                        if(suggestion.startsWith(last.raw))
                        {
                            last.raw = suggestion;
                            last.text = text;
                            return;

                        }
                    }

                    
                    
                    nodeSuggestions.push({
                        raw: suggestion,
                        text: text,
                        level: currentStartNode.level + 1,
                        isPending: true,
                        id: ai.randomString()
                    });
                }
            });

        }
    });



}

const bulletBreadcrumbs = computed(() => {
    var items = [];

    if(startNodeIndex.value === null)
        return items;

    var bullet = bullets.value[startNodeIndex.value];
    items.push(bullet);

    while(bullet.level > 0)
    {
        var parentIndex = getParentIndex(bullet);;
        bullet = bullets.value[parentIndex];
        items.unshift(bullet);
    }

    return items.map(x => ({text: x.text, id: x.id, level: x.level, bullet: x, index: x.index}));
});


const bulletsToRender = computed(() => {
    var items = [];

    if(bullets.value.length == 0)
        items = [{text: "", children: [], level: 0, id: ai.randomString()}];


    if(startNodeIndex.value === null)
        items = [...bullets.value];
    else
    {
        var children = getChildren(startNode.value);

        if(children?.length == 0)
            items = [startNode.value];
        else 
            items = [startNode.value, ...children];
    }

    //loop through items and remove any items that are a child of a bullet that isCollapsed
    for(var i = 0; i < items.length; i++)
    {
        var bullet = items[i];

        if(bullet.isCollapsed)
        {
            var children = getChildren(bullet);
            items.splice(i + 1, children.length);
        }
    }


    if(startNode.value?.suggestions?.length)
        items = [...items, ...startNode.value.suggestions];

    console.log(items);
    return items;
});

function itemChanged(bullet, event) {
    console.log("itemChanged", bullet, event);
    bullet.text = event.after;
    saveBulletPoints();
}
async function rejectAISuggestion(point) {
    var suggestions = startNode.value.suggestions;
    var index = suggestions.findIndex(x => x.id == point.id);
    suggestions.splice(index, 1);
    await nextTick();
    onFocus(suggestions[index]?.bullet || suggestions[index - 1]?.bullet);
}


async function acceptAISuggestion(point) {
    point.isSelected = true;
    var suggestions = startNode.value.suggestions;


    //var bullet = currentFocusBullet.value ?? startNode.value;
    var bullet = startNode.value;
    var children = getChildren(bullet);
    var nextIndex = bullet.index + children.length + 1;
    var level = bullet.level;

    if(children.length)
        level++;

    var points = parseBulletPointsFlat(point.raw);
    points.forEach(x => x.level += level);
    insertBullet(nextIndex, point);
    point.isPending = false;
    point.bullet = bullets.value[nextIndex];

    //remove point from suggestions
    var index = suggestions.findIndex(x => x.id == point.id);
    suggestions.splice(index, 1);

    saveBulletPoints();
    await nextTick();
    onFocus(suggestions[index] || suggestions[index - 1]);
}

function getBulletChar(bullet){
    var bulletChars = ["\u2022", "\u25E6", "\u25AA"];
    return bulletChars[bullet.level % bulletChars.length];
}

function toggleBulletVisibility(bullet){
    bullet.isCollapsed = !bullet.isCollapsed;
}

</script>

<template>
    <div v-if="bulletsToRender">
        <div class="flex-one-line align-start">
            <sl-dropdown>
                <sl-icon-button slot="trigger" name="three-dots-vertical"></sl-icon-button>
                <sl-menu>
                    <sl-menu-item>
                        <sl-copy-button hoist :value="markdown"></sl-copy-button> Copy
                    </sl-menu-item>
                </sl-menu>
            </sl-dropdown>
            <sl-breadcrumb>
                <sl-breadcrumb-item @click="setStartNode(null)">Notes</sl-breadcrumb-item>
                <sl-breadcrumb-item v-for="bc in bulletBreadcrumbs" @click="setStartNode(bc.bullet)">{{bc.text}}</sl-breadcrumb-item>
            </sl-breadcrumb>
        </div>
        
        <div class="bullet" v-for="bullet in bulletsToRender" :class="{focus: currentFocusBullet === bullet, isPending: bullet.isPending }">
            <div class="flex-one-line align-start">
                <div class="collapse-button" @click="toggleBulletVisibility(bullet)">
                    <div v-if="bullet.children?.length">
                        <sl-icon name="chevron-right" v-if="bullet.isCollapsed"></sl-icon>
                        <sl-icon name="chevron-down" v-else></sl-icon>
                    </div>
                </div>
                <div class="margin" :style="{ minWidth: `calc(var(--sl-spacing-2x-large) * ${bullet.level - (startNode?.level ?? 0)} + 3rem + 2px)` }">
                    <span class="magic">
                        <sl-dropdown @click="onFocus(bullet)" style="text-align: left;">
                            <sl-icon-button slot="trigger" name="three-dots-vertical"></sl-icon-button>
                            <sl-menu style="font-size: 10px;">
                                <sl-menu-label>Not Implemented</sl-menu-label>
                                <sl-menu-item>
                                    Suggest Alternatives
                                </sl-menu-item>
                                <sl-menu-item>
                                    Delete (shift + delete)
                                </sl-menu-item>
                                <sl-menu-item>
                                    Move Up (alt + up)
                                </sl-menu-item>
                                <sl-menu-item>
                                    Move Down (alt + down)
                                </sl-menu-item>
                                <sl-menu-item>
                                    Increase Indent (tab)
                                </sl-menu-item>
                                <sl-menu-item>
                                    Decrease Indent (shift + tab)
                                </sl-menu-item>
                            </sl-menu>
                        </sl-dropdown>
                        <sl-icon name="magic" @click="setStartNode(bullet)"></sl-icon>
                    </span>
                    <span class="bullet-char">{{getBulletChar(bullet)}}</span>
                </div>
                <div class="content">
                    <!-- v-model="bullets[getIndex(bullet)].text" -->
                    <UTextarea 
                        borderless="true" 
                        min-rows="1"
                        v-model="bullet.text"

                        @keypress.enter.stop.prevent=   "onEnter(bullet, $event)" 
                        @keydown.escape.stop.prevent=   "onEscape(bullet, $event)" 

                        @keydown.arrow-up=              "movePrevious(bullet, $event)"
                        @keydown.arrow-down=            "moveNext(bullet, $event)" 

                        @keydown.backspace=             "onBackspace(bullet, $event)"

                        @keydown.tab.prevent=           "onTab(bullet, $event)" 
                        @keydown.shift.tab.prevent=     "onShiftTab(bullet, $event)"

                        @keydown.ctrl.z.prevent=        "undo()" 
                        @keydown.ctrl.y.prevent=        "redo()" 

                        @blur=                          "onBlur(bullet, $event)"
                        @focus=                         "onFocus(bullet)" 

                        :ref=                           "(el) => setTextRef(el, bullet)"
                        @change=                        "itemChanged(bullet, $event)"
                    ></UTextarea>

                    <div v-if="currentFocusBullet === bullet">
                        <div v-if="bullet.isPending">
                            <sl-icon-button name="hand-thumbs-up" @click="acceptAISuggestion(bullet)"></sl-icon-button>
                            <sl-icon-button name="shuffle"></sl-icon-button>
                            <sl-icon-button name="hand-thumbs-down" @click="rejectAISuggestion(bullet)"></sl-icon-button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="bullet" v-if="startNode?.busy?.suggestions">
            <div class="flex-one-line align-start">
                <div class="collapse-button"></div>
                <div class="margin" :style="{ minWidth: `calc(var(--sl-spacing-2x-large) * ${1} + var(--sl-spacing-2x-large))` }">
                    <span class="bullet-char">{{getBulletChar({level: 1})}}</span>
                </div>
                <div class="content">
                    Loading suggestions...
                    <sl-spinner></sl-spinner>
                </div>
            </div>
        </div>

        <div v-if="startNode">
            <!-- <sl-button @click="generateQuestionTopics(startNode)">Generate Q&A</sl-button> -->
            <h6 style="margin-top: var(--sl-spacing-x-large)">Topics to Explore:</h6>
            

            <ButtonOptionsList v-model="startNode.topics" @select="selectQuestionTopic(startNode, $event)" :busy="startNode.busy.topics"></ButtonOptionsList>

            <div v-if="startNode?.selectedTopic?.questions" style="margin-top: var(--sl-spacing-small)">
                <div v-if="Object.keys(startNode.selectedTopic.questions).length == 0">
                    Considering questions for {{startNode.selectedTopic.topic.toLowerCase()}}...
                    <sl-spinner></sl-spinner>
                </div>
                <div v-else>
                    <sl-button variant="text" size="small" @click="regenerateQuestions(startNode, startNode.selectedTopic)">Regenerate Questions</sl-button>
                </div>
                <div v-for="(question, key) in startNode.selectedTopic.questions" class="my-small">
                    <sl-details @sl-show="openQuestion(startNode, question)">
                        <div slot="summary" style="font-weight: 500;">
                            <div class="flex-one-line align-start">
                                <sl-icon name="check-lg" v-if="question.selectedAnswers.length" class="question-check-icon"></sl-icon>
                                <div>
                                    {{question.questionText}}
                                </div>
                            </div>
                        </div>
                        <!-- <div class="adjust-up">
                            <sl-animation>
                                <sl-textarea class="questionAnswer" v-model="question.answer" filled placeholder="Type your answer here, or select an answer below" rows="2" resize="auto">
                                </sl-textarea>
                            </sl-animation>
                            <div v-if="question.answer?.trim()?.length" style="margin-top: var(--sl-spacing-x-small)">
                                <sl-button variant="success" size="small" @click="saveQuestionAnswer(question)" style="margin-right: var(--sl-spacing-2x-small)">Save</sl-button>
                                <sl-button variant="default" size="small" @click="clearQuestionAnswer(question)">Clear</sl-button>
                            </div>
                        </div> -->
                        <div v-if="question.busy" class="adjust-up">
                            Loading answer suggestions... <sl-spinner></sl-spinner>
                        </div>
                        <div v-if="!question.answer?.trim()?.length" style="margin-top: var(--sl-spacing-2x-small);">
                            <sl-card class="selectable" v-for="answer in question.answers" @click="saveQuestionAnswer(startNode, question, answer)">
                                <div v-html="ai.html(answer)"></div>
                            </sl-card>
                        </div>
                    </sl-details>
                </div>
            </div>
        </div>

        

        <div v-if="bulletAI[startNode?.id ?? 'root']">
            <ButtonOptionsList v-model="bulletAI[startNode?.id ?? 'root'].themes" @select="makeGuess(i, $event)"></ButtonOptionsList>
        </div>

        <div class="guesses">
            <sl-card v-for="guess in bulletAI[startNode?.id ?? 'root']?.guesses" class="selectable" @click="selectGuess(i, guess)">
                {{ guess }}
            </sl-card>
        </div>
    </div>
</template>

<style scoped>

.collapse-button {
    flex-grow: 0;
    cursor: pointer;
    margin-right: var(--sl-spacing-x-small);
    width: 1rem;
    font-size: var(--sl-font-size-x-small);
    color: var(--pico-color-gray-500);
    min-width: 1rem;
}

.bullet .collapse-button [name="chevron-down"] {
    display: none;
}

.bullet:hover .collapse-button [name="chevron-down"] {
    display: inline;
    color: var(--pico-color-gray-800);
}

.themes sl-button {
    margin-right: var(--sl-spacing-x-small);
    margin-bottom: var(--sl-spacing-x-small);
}

.u-textarea:deep() .u-textarea-content {
    --padding-x: 0px;
    --padding-y: 0.1rem;
}

.isPending .u-textarea:deep() .u-textarea-content {
    color: green;
}

.suggestions {
    color: var(--sl-color-gray-500);

}

.suggestions li {
    padding-top: var(--sl-spacing-x-small);
}

.margin {
    flex-grow: 0;
    text-align: right;
    padding-right: var(--sl-spacing-2x-small);
    align-self: self-start;
    height: 1rem;

}

.content {
    flex-grow: 1;
}

.margin-toolbar {
    display: none;
    /* width: 0; 
    overflow: visible; */
}

.magic {
    display: none;
}

.magic sl-icon[name="magic"] {
    font-size: 0.8rem;

}

.bullet:hover:not(.isPending) .magic,
.bullet.focus:not(.isPending) .magic {
    display: inline-block;
}

.bullet:hover:not(.isPending) .bullet-char,
.bullet.focus:not(.isPending) .bullet-char {
     display: none; 
}

.magic:hover {
    cursor: pointer;
}

.bullet-char {
    font-size: var(--sl-font-size-x-large);
    line-height: 1em;
}

sl-details > .adjust-up {
    position: relative;
    top: calc(var(--sl-spacing-medium) * -1 + 5px);
    height: 0;
}

.question-check-icon {
    margin-right: var(--sl-spacing-x-small);
    color: var(--sl-color-success-600);

}

.magic sl-dropdown ::part(label) {
    font-size: var(--sl-font-size-x-small);
}
</style>
