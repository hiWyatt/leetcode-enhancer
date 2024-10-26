debug = false;

function print(x) {
    if (debug)
        console.log(x)
}
/* ==================== Compatibility Between Chrome and Firefox ==================== */
var browser = browser || chrome;

/* ==================== Initialization ==================== */
document.addEventListener('DOMContentLoaded', initExtension);

function initExtension() {
    attachCheckboxEventListeners();
    loadSavedSettings();
    initFeedbackButtons();
    initDetailsButton();
    initAISection();
}

/* ==================== AES Encryption and Decryption Functions ==================== */

async function generateAESKey() {
    return window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptData(data, aesKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encryptedData = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encodedData
    );

    return { encryptedData: new Uint8Array(encryptedData), iv };
}

async function decryptData(encryptedData, aesKey, iv) {
    const decryptedData = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encryptedData
    );

    return new TextDecoder().decode(decryptedData);
}

/* ==================== API Key Handling ==================== */

async function storeApiKey(apiKey) {
    const aesKey = await generateAESKey();
    const { encryptedData, iv } = await encryptData(apiKey, aesKey);

    storeData('encryptedApiKey', Array.from(encryptedData));
    storeData('aesIV', Array.from(iv));

    const exportedKey = await window.crypto.subtle.exportKey("raw", aesKey);
    storeData('aesKey', Array.from(new Uint8Array(exportedKey)));
}

async function loadApiKey() {
    const encryptedData = await getDataAsUint8Array('encryptedApiKey');
    const iv = await getDataAsUint8Array('aesIV');
    const aesKeyBytes = await getDataAsUint8Array('aesKey');

    if (!encryptedData || !iv || !aesKeyBytes) {
        print("No API key or encryption details found.");
        return null;
    }

    const aesKey = await window.crypto.subtle.importKey(
        "raw",
        aesKeyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    return await decryptData(encryptedData, aesKey, iv);
}

/* ==================== Checkbox Settings Handling ==================== */

function attachCheckboxEventListeners() {
    const checkboxes = document.querySelectorAll("input[name=settings]");
    checkboxes.forEach(chb => chb.addEventListener('change', onCheckboxChange));
}

function loadSavedSettings() {
    getData("options", updateCheckboxes);
}

function updateCheckboxes(options) {
    if (isIterable(options)) {
        options.forEach(option => {
            const chb = document.getElementById(option.optionName);
            chb.checked = option.checked;
        });
    }
}

function onCheckboxChange() {
    browser.tabs.query({}, function(tabs) {
        const options = [];
        const checkboxes = document.querySelectorAll('input[name=settings]');
        checkboxes.forEach(chb => options.push({ optionName: chb.value, checked: chb.checked }));
        storeData('options', options);

        const response = { options };
        try {
            tabs.forEach(tab => browser.tabs.sendMessage(tab.id, response));
        }
        catch {
            print("error while sending the message");
        }
    });
}

/* ==================== Feedback and Details Buttons ==================== */

function initFeedbackButtons() {
    document.getElementById('fBtn').addEventListener("click", function() {
        const isFirefox = typeof InstallTrigger !== 'undefined';
        const isEdge = /Edge/.test(navigator.userAgent);
        if (isFirefox) {
            this.href = "https://addons.mozilla.org/en-US/firefox/addon/leetcode-enhancer/";
        } else if (isEdge) {
            this.href = "https://microsoftedge.microsoft.com/addons/detail/leetcode-enhancer/dgddijgkneackjhmijacbopefpladfia";
        }
    });
}

function initDetailsButton() {
    document.getElementById('deBtn').addEventListener("click", function() {
        const isClose = document.getElementById('deBtn').innerHTML == '►';
        document.getElementById('msg').style.display = isClose ? "block" : "none";
        document.getElementById('deBtn').innerHTML = isClose ? '&#9660;' : '►';
    });
}

/* ==================== AI Section for API Key ==================== */

function initAISection() {
    const apiKeyInput = document.getElementById('api-key');
    const deleteApiKeyButton = document.getElementById('delete-api-key');
    const triggerActionButton = document.getElementById('trigger-action');

    loadApiKey().then((decryptedApiKey) => {
        if (decryptedApiKey) {
            apiKeyInput.value = decryptedApiKey;
        } else {
            print("No API key found in storage.");
        }
    });

    apiKeyInput.addEventListener('input', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey.length > 0) {
            storeApiKey(apiKey);
            print("API Key saved.");
        }
    });

    deleteApiKeyButton.addEventListener('click', () => {
        apiKeyInput.value = '';
        browser.storage.local.remove(['encryptedApiKey', 'aesIV', 'aesKey']);
        print("API Key deleted.");
    });

    triggerActionButton.addEventListener('click', async () => {
        if(!isTermsCheckboxChecked()) {
            alert("Please accept the terms and condition");
            return;
        }
        const apiKey = apiKeyInput.value;
        if (apiKey) {
            sendMessageToContentScriptToGetCode(apiKey);
        } else {
            alert("Please provide API Key");
        }
    });

    const termsCheckbox = document.getElementById('terms-checkbox');

    loadTermsCheckboxState();

    termsCheckbox.addEventListener('change', function() {
        storeTermsCheckboxState(termsCheckbox.checked);
    });

    getData('outputDivCode', displayDataInOutputDiv);

    function displayDataInOutputDiv(outputData) {
        if(outputData) {
            document.getElementById("output").innerHTML = outputData;
        }
    }
}

function storeTermsCheckboxState(isChecked) {
    browser.storage.local.set({ termsAccepted: isChecked });
}

function loadTermsCheckboxState() {
    try {
        browser.storage.local.get('termsAccepted', (result) => {
            const isChecked = result.termsAccepted;
            const termsCheckbox = document.getElementById('terms-checkbox');
            if (termsCheckbox) {
                termsCheckbox.checked = !!isChecked;
            }
        });
    }
    catch (err) {
        print("Error while reading termsAccepted");
    }
}

function isTermsCheckboxChecked() {
    const termsCheckbox = document.getElementById('terms-checkbox');
    return termsCheckbox && termsCheckbox.checked;
}

function sendMessageToContentScriptToGetCode(apiKey) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        try {
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, { action: 'getCode' }, (response) => {
                    if (response && response.code) {
                        const code = response.code;
                        const question = "Refactoring my LeetCode solution to improve its code quality and readability. \n";
                        makeCohereRequest(apiKey, question + code);
                    }
                });
            });
        }
        catch(err) {
            print("error while sending the message");
        }
    });
}

/* ==================== Cohere API Call ==================== */

function makeCohereRequest(apiKey, question) {
    actionButtonUnusable();
    const apiUrl = 'https://api.cohere.ai/v1/generate';
    const data = {
        model: 'command',
        prompt: question,
        temperature: 0.7,
        k: 0,
        p: 0.1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop_sequences: []
    };

    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        const outputDiv = document.getElementById('output');
        outputDiv.innerHTML = data.generations[0].text.replace(/\n/g, '<br>').replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
        storeData("outputDivCode", outputDiv.innerHTML);
    })
    .catch(error => {
        alert("Operation failed. Please check your api key.");
        print("error while sending request to cohere" + error);
    }).finally( () => {
        actionButtonUsable();
    })
}

function actionButtonUsable() {
    const triggerButton = document.getElementById('trigger-action');
    triggerButton.innerText="Refactor Code"
    triggerButton.style.backgroundColor = 'buttonface'; // Set background to green when usable
    triggerButton.disabled = false; // Enable the button
}

function actionButtonUnusable() {
    const triggerButton = document.getElementById('trigger-action');
    triggerButton.innerText="processing.."
    triggerButton.style.backgroundColor = 'yellow'; // Set background to yellow when unusable
    triggerButton.disabled = true; // Disable the button
}

/* ==================== Storage and Utility Functions ==================== */

function storeData(key, value) {
    const data = {};
    data[key] = value;
    browser.storage.local.set(data);
}

function getData(key, callback) {
    try {
        browser.storage.local.get([key], result => callback(result[key]));
    }
    catch (err) {
        print("Error while retrieving key");
    }
}

async function getDataAsUint8Array(key) {
    return new Uint8Array((await browser.storage.local.get(key))[key] || []);
}

function isIterable(obj) {
    return obj != null && typeof obj[Symbol.iterator] === 'function';
}
