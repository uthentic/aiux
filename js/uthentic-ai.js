export function updateProps(obj, update) {
    for (var key in update) {
        obj[key] = update[key];
    }
};

//export const baseURL = "https://localhost:7074";
export const baseURL = "https://boook.azurewebsites.net";

export function makeSlug(title) {
    if (!title) return null;
    title = title.toLowerCase();
    title = title.replace(/[^a-z0-9]/g, "-");
    title = title.replace(/-+/g, "-");
    title = title.replace(/^-|-$/g, "");
    return title;
}


export const randomString = function (length = 16, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    const charactersLength = charset.length;
    const randomBytes = new Uint8Array(length);

    crypto.getRandomValues(randomBytes);

    for (let i = 0; i < length; i++) {
        const randomIndex = randomBytes[i] % charactersLength;
        result += charset[randomIndex];
    }

    return result;
}

export async function watchStream(streamID, onUpdate) {
    streams[streamID] = onUpdate;
};

export const busy = {};

export const streams = {};
export const pageInstanceID = randomString();


/**
 * Executes a stream flow and returns a promise that resolves with the result.
 * 
 * @param {string} flowID - The ID of the flow to execute.
 * @param {Object} settings - The settings for the stream flow execution.
 * @param {Object} settings.$vars - The variables to be passed to the flow.
 * @param {Object} settings.$responses - The responses to be passed to the flow.
 * @param {Function} settings.$update - The callback function to be called when there is an update from the stream flow.
 * @param {Function} settings.$busy - The callback function to indicate the busy state of the stream flow.
 * @returns {Promise<string>} - A promise that resolves with the result of the stream flow execution.
 */
export function streamFlowXML(flowID, settings) {

    if (!settings)
        settings = {};

    var vars = settings.$vars;
    var responses = settings.$responses;

    var text = "";

    var tags = Object.keys(settings).filter(c => !c.startsWith("$"));

    var onUpdate = settings.$update;
    var busy = settings.$busy;
    if (busy) busy(true);

    var resolvePromiseFunc = null;
    const myPromise = new Promise((resolve, reject) => {
        resolvePromiseFunc = resolve;
    });

    streamFlow(flowID, vars, responses, (response) => {
        try {

            text += response.contentDelta;

            if (response.isComplete) {
                text = response.fullContent; //we do this in case we missed some content when it was streaming
            }

            var unifiedUpdate = {};

            tags.forEach(tag => {
                try {

                    var values = parseXMLTags(text, tag);

                    if (values?.length) {
                        if (onUpdate)
                            unifiedUpdate[tag] = values;

                        var data = { tag: tag, values: values, isComplete: response.isComplete };

                        if (values.length == 1)
                            data.value = values[0];

                        settings[tag](data);
                    }
                } catch (error) {
                    console.log("Error in tag loop", error);

                }
            });

            if (onUpdate) {
                var data = { data: unifiedUpdate, contentDelta: response.contentDelta, fullContent: text, isComplete: response.isComplete };
                onUpdate(data);
            }

            if (response.isComplete && response.isFinal) {
                if (busy)
                    busy(false);

                resolvePromiseFunc(text);
            }
        } catch (error) {
            console.log(error);
        }
    });

    return myPromise;

}

export async function streamFlow(flowID, vars, responses, onUpdate, streamID) {
    // allow for optional onUpdate parameter
    if (onUpdate && (typeof onUpdate === "string") && !streamID) {
        onUpdate = null;
        streamID = onUpdate;
    }

    if (!streamID) {
        streamID = randomString();
    }

    if (onUpdate) {
        streams[streamID] = onUpdate;
    }

    await aiHub.reconnect();

    var headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json",
        "x-app-id": uthentic.p.appID,
        "x-ai-stream-id": streamID,
        "x-ai-connection-id": aiHub.connectionID
    };

    if (uthentic.user && uthentic.user.token) {
        headers["x-auth-token"] = uthentic.user.token;
    }

    if (flowID.startsWith("flow://")) {
        flowID = flowID.substring(7);
    }


    var url = baseURL + "/api/flows/execute-link";
    var data = { flowLink: flowID };

    if (vars) {
        data.variablesJSON = JSON.stringify(vars)
    }
    if (responses) {
        data.responsesJSON = JSON.stringify(responses);
    }

    var dataBody = "";

    if (data)
        dataBody = Object.keys(data)
            .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
            .join("&");

    var response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "include",
        headers: headers,
        body: dataBody
    });

    return response.json();
}

export async function streamAIPost(url, data, onUpdate, streamID) {

    // allow for optional onUpdate parameter
    if (onUpdate && (typeof onUpdate === "string") && !streamID) {
        onUpdate = null;
        streamID = onUpdate;
    }

    if (!streamID) {
        streamID = randomString();
    }

    if (onUpdate) {
        streams[streamID] = onUpdate;
    }

    await aiHub.reconnect();

    var headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json",
        "x-app-id": uthentic.p.appID,
        "x-ai-stream-id": streamID,
        "x-ai-connection-id": aiHub.connectionID
    };

    if (uthentic.user && uthentic.user.token) {
        headers["x-auth-token"] = uthentic.user.token;
    }

    if (url.startsWith("~/"))
        url = uthentic.baseURL + url.substring(1);

    if (url.startsWith("flow://")) {
        var flowID = url.substring(7);
        url = "/api/flows/execute-link";
        data = { flowLink: flowID, variablesJSON: JSON.stringify(data) };
    }

    var dataBody = "";

    if (data)
        dataBody = Object.keys(data)
            .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
            .join("&");

    var response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "include",
        headers: headers,
        body: dataBody
    });

    return response.json();
}

export const aiHub = {
    connection: null,
    connectionID: null,
    async invoke() {
        await this.reconnect();
        this.connection.invoke(...arguments);
    },
    connectionEvents() {
        var connection = this.connection;
        connection.on("Update", function (response) {
            streams[response.streamID](response);
            //console.log("Update", response);
        });
    },
    async reconnect() {
        if (this.connection == null || this.connection.state == "Disconnected") {
            await this.connect();
        }
    },
    async connect() {
        if (this.connection === null) {
            this.connection = new signalR.HubConnectionBuilder().withUrl(baseURL + "/stream/ai").build();
            //this.connection = new signalR.HubConnectionBuilder().withUrl("https://boook.azurewebsites.net/stream/ai").build();

            if (!this.connectionID)
                this.connectionID = randomString();

            this.connectionEvents();
        }

        if (this.connection.state == "Disconnected");
        {
            await this.connection.start();
            this.connection.invoke("Join", this.connectionID, uthentic.user?.token ?? `anon:${randomString(16)}`);
        }
    }
};

export function parseXMLTag(content, tagName) {
    const tags = parseXMLTags(content, tagName);
    return tags.length > 0 ? tags[0]?.trim() : null;
};

export function parseXMLTags(content, tagName) {
    if (tagName.length > content.length) {
        var temp = content;
        content = tagName;
        tagName = temp;
    }

    tagName = tagName.replace(/</g, "").replace(/>/g, "");

    const regex = new RegExp(`<${tagName}>(.*?)(<(\/(${tagName}>|[^>]+$)?)?$|<\/${tagName}>|$)`, "gs");
    const matches = [...content.matchAll(regex)];
    return matches.map(match => match[1]?.trim());
};

export function removeXMLTagContent(content, tagName) {
    const pattern = new RegExp(`<${tagName}>.*?<\/${tagName}>`, "gs");
    return content.replace(pattern, "");
};


//todo: this is very not right; Use the following test case
/*
Example:
<fruit>apple <color>yellow></color></fruit> some text content <table>flat</table> <feeling>love</feeling>
<tag1> test <tag1>hello world</tag1></tag1>
Running the above example though the javascript function would return:
[
    { tag: "fruit", content: "apple <color>yellow></color> <fruit>banan</fruit>", fullMatch: "<fruit>apple <color>yellow></color></fruit>" },
    { tag: "table", content: "flat", fullMatch: "<table>flat</table>" },
    { tag: "feeling", content: "love", fullMatch: "<feeling>love</feeling>" },
    { tag: "tag1", content: " test <tag1>hello world</tag1>", fullMatch: "<tag1> test <tag1>hello world</tag1></tag1>" }

]
*/
export function extractXMLNodes(xmlString) {
    console.log("Using extractXMLNodes which is not working right.");
    const regex = /<(\w+)>(.*?)<\/\1>/gs;
    const results = [];

    let match;
    while ((match = regex.exec(xmlString)) !== null) {
        const fullMatch = match[0];
        const tag = match[1];
        const content = match[2];

        results.push({ tag, content, fullMatch });

        // Remove the matched part from the xmlString to avoid duplicate matches
        xmlString = xmlString.replace(fullMatch, '');
    }

    return results;
}

export function paginate(array, pageSize) {
    var items = [...array];
    var pages = [];

    for (let i = 0; i < items.length; i += pageSize) {
        pages.push({ pageIndex: i / pageSize, items: items.slice(i, i + pageSize) });
    }

    return pages;
}

export function isBulletedList(str) {
    // Define the bullet point patterns
    const bulletPatterns = [
        /^[•·○●■□▪▫►▻◆◇★☆✓✗❧➢\-*+]/,
        /^(?:(?:[1-9]\d*|[a-zA-Z]|[ivxlcdmIVXLCDM]+)\.\s)/
    ];

    // Split the string into lines and remove empty lines
    const lines = str.split('\n').filter(line => line.trim().length > 0);

    // Check if there are any non-empty lines
    if (lines.length === 0) {
        return false;
    }

    // Check each line
    return lines.every(line => {
        const trimmedLine = line.trim();
        return bulletPatterns.some(pattern => pattern.test(trimmedLine));
    });
}

export function normalizeBulletedList(str) {
    const lines = str.split('\n');
    const bulletPattern = /^(\s*)([•·○●■□▪▫►▻◆◇★☆✓✗❧➢\-*+]|\d+[\.\)]|\w+[\.\)])\s*/;

    const normalizedLines = lines.map(line => {
        const match = line.match(bulletPattern);
        if (match) {
            const [, indentation, bullet] = match;
            return `${indentation}- ${line.slice(match[0].length)}`;
        }
        return line; // Keep non-bullet lines unchanged
    });

    return normalizedLines.join('\n');
}

export function parseBulletPoints(bulletPointsText) {
    const bulletPoints = [];

    bulletPointsText = normalizeBulletedList(bulletPointsText);

    var lines = bulletPointsText.split("\n");
    var last = null;

    lines.forEach(line => {
        var indent = line.match(/^\s*/)[0].length;
        const bulletPattern = /^(\s*)([•·○●■□▪▫►▻◆◇★☆✓✗❧➢\-*+]|\d+[\.\)]|\w+[\.\)])\s*/;

        //remove leading spaces and hyphens
        var text = line.replace(bulletPattern, "");

        if (text.length == 0)
            return;

        if (indent == 0 || last == null) {
            last = { text, children: [], level: 0, indent: indent, parent: null };
            bulletPoints.push(last);
            return;
        }
        else {

            var parent = last;
            while (parent != null && indent <= parent.indent) {
                parent = parent.parent;
            }

            if (parent == null) {
                last = { text, children: [], level: 0, indent: indent, parent: null };
                bulletPoints.push(last);
                return;
            }

            last = { text, children: [], level: parent.level + 1, indent: indent, parent: parent };
            parent.children.push(last);
        }
    });

    var q = [...bulletPoints];
    while (q.length > 0) {
        var bp = q.shift();
        delete bp.indent;
        delete bp.parent;
        q.push(...bp.children);
    }

    //normalize levels
    var minLevel = Math.min(...bulletPoints.map(bp => bp.level));
    bulletPoints.forEach(bp => {
        bp.level -= minLevel;
    });

    return bulletPoints;
}

export function renderBulletPoints(bulletPoints) {
    if (!bulletPoints?.length)
        return "";

    var result = "";

    bulletPoints.forEach(bp => {
        result += "  ".repeat(bp.level) + "- " + bp.text + "\n";
        result += renderBulletPoints(bp.children);
    });

    return result;
}


const dedupeActionPromises = {};


/**
 * Deduplicates actions based on a given action key.
 * The action is executed after a delay, and if the same action key is called again before the delay is over, the original action is replaced with the new action.
 * @param {string} actionKey - The key used to identify the action.
 * @param {Function} action - The action to be executed.
 * @param {number} [delayInMs=100] - The delay in milliseconds before executing the action.
 * @returns {Promise} - A promise that resolves when the action is executed.
 */
export function dedupeActions(actionKey, action, delayInMs = 100) {
    if (!dedupeActionPromises[actionKey]) {
        dedupeActionPromises[actionKey] = {
            action: action,
            promise: new Promise((resolve, reject) => {
                setTimeout(() => {
                    dedupeActionPromises[actionKey].action();
                    resolve();
                    delete dedupeActionPromises[actionKey];
                }, delayInMs);
            })
        };
    }
    else {
        dedupeActionPromises[actionKey].action = action;
    }

    return dedupeActionPromises[actionKey].promise;
}

export function html(html) {
    return makeHtml(html);
}

export async function read(path = "uthentic_default") {
    //TODO: handle network error
    var result = await uthentic.get(baseURL + "/api/data/read", { path: path });

    if (!result.success) {
        if (result.error == "Unauthorized") {
            uthentic.logout();
            await uthentic.login();

            return uthentic.read(path);
        }
    }
    else {
        if (result.data == null || typeof result.data == "string" && result.data.length == 0)
            return null;
        else
            return result.data;
    }
};

export async function write(path, data) {
    if (typeof path == "object") {
        data = path;
        path = "uthentic_default";
    }
    
    //TODO: handle error
    var json = await uthentic.post(baseURL + "/api/data/write", {
        path: path,
        data: JSON.stringify(data)
    });

    return json;
}

