const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
    assert.ok(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
    return source.slice(start, end);
}

function textareaTag(id) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = indexSource.match(new RegExp(`<textarea\\b(?=[^>]*\\bid="${escapedId}")[^>]*>`, 'i'));
    assert.ok(match, `${id} must remain a textarea.`);
    return match[0];
}

function assertClickWiring(id, expectedCall) {
    const marker = `getElementById('${id}')?.addEventListener`;
    const start = appSource.indexOf(marker);
    assert.ok(start >= 0, `${id} must have a click listener.`);
    const listener = appSource.slice(start, start + 340);
    assert.ok(listener.includes(expectedCall), `${id} must call ${expectedCall}.`);
}

function jsonRequestBodies(source) {
    return Array.from(source.matchAll(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/g), match => match[1]);
}

test('translation and graphics views expose accessible bounded instruction textareas', () => {
    const controls = [
        ['finnish-translation-ai-check-instructions', '4000'],
        ['translation-workspace-review-instructions', '4000'],
        ['graphics-html-instructions', '3000']
    ];

    controls.forEach(([id, maxLength]) => {
        const tag = textareaTag(id);
        assert.match(tag, new RegExp(`\\bmaxlength="${maxLength}"`));
        assert.match(tag, new RegExp(`\\baria-describedby="${id}-help"`));
        assert.match(indexSource, new RegExp(`<label\\b[^>]*\\bfor="${id}"`));
        assert.match(indexSource, new RegExp(`<(?:p|small)\\b[^>]*\\bid="${id}-help"`));
    });

    assert.match(indexSource, /class="translation-review-instructions"[\s\S]*?id="finnish-translation-ai-check-instructions"/);
    assert.match(indexSource, /class="translation-review-instructions"[\s\S]*?id="translation-workspace-review-instructions"/);
    assert.match(indexSource, /class="marketing-html-form graphics-html-instructions"[\s\S]*?id="graphics-html-instructions"/);
});

test('translation instruction helper trims both sources and treats untrusted text as opaque data', () => {
    const values = {
        'translation-workspace-review-instructions': '  Sailyta kertojan savy.  ',
        'finnish-translation-ai-check-instructions': '   '
    };
    const context = {
        document: {
            getElementById(id) {
                return { value: values[id] };
            }
        }
    };
    const helperSource = sourceBetween(
        appSource,
        'function translationReviewInstructions',
        'function renderTranslationWorkspaceReview'
    );
    vm.runInNewContext(`
        ${helperSource}
        globalThis.translationReviewInstructions = translationReviewInstructions;
    `, context);

    assert.equal(context.translationReviewInstructions(), 'Sailyta kertojan savy.');
    assert.equal(context.translationReviewInstructions('finnish'), '');

    const untrusted = '<img src=x onerror="globalThis.instructionXss = true">';
    values['finnish-translation-ai-check-instructions'] = `\n ${untrusted} \t`;
    const trimmed = context.translationReviewInstructions('finnish');
    assert.equal(trimmed, untrusted);
    assert.equal(context.instructionXss, undefined);
    assert.equal(JSON.parse(JSON.stringify({ instructions: trimmed })).instructions, untrusted);
});

test('all eight interactive translation actions include the shared instructions value', () => {
    const actions = [
        {
            name: 'workspace first current',
            sourceName: 'workspace',
            id: 'translation-workspace-review-current-btn',
            call: 'checkTranslationWorkspaceCurrent',
            start: 'async function checkTranslationWorkspaceCurrent',
            end: 'async function checkAllTranslationWorkspaceSegments'
        },
        {
            name: 'workspace first all',
            sourceName: 'workspace',
            id: 'translation-workspace-review-all-btn',
            call: 'checkAllTranslationWorkspaceSegments',
            start: 'async function checkAllTranslationWorkspaceSegments',
            end: 'async function checkTranslationWorkspaceDoubleCurrent'
        },
        {
            name: 'workspace double current',
            sourceName: 'workspace',
            id: 'translation-workspace-review-double-check-current-btn',
            call: 'checkTranslationWorkspaceDoubleCurrent',
            start: 'async function checkTranslationWorkspaceDoubleCurrent',
            end: 'async function checkAllTranslationWorkspaceDoubleSegments'
        },
        {
            name: 'workspace double all',
            sourceName: 'workspace',
            id: 'translation-workspace-review-double-check-all-btn',
            call: 'checkAllTranslationWorkspaceDoubleSegments',
            start: 'async function checkAllTranslationWorkspaceDoubleSegments',
            end: 'function applyTranslationReviewBatchResult'
        },
        {
            name: 'Finnish first current',
            sourceName: 'finnish',
            id: 'finnish-translation-ai-check-run-btn',
            call: 'runFinnishTranslationAiCheck',
            start: 'async function runFinnishTranslationAiCheck',
            end: 'async function runAllFinnishTranslationAiChecks'
        },
        {
            name: 'Finnish first all',
            sourceName: 'finnish',
            id: 'finnish-translation-ai-check-run-all-btn',
            call: 'runAllFinnishTranslationAiChecks',
            start: 'async function runAllFinnishTranslationAiChecks',
            end: 'async function runFinnishTranslationAiDoubleCheck'
        },
        {
            name: 'Finnish double current',
            sourceName: 'finnish',
            id: 'finnish-translation-ai-double-check-run-btn',
            call: 'runFinnishTranslationAiDoubleCheck',
            start: 'async function runFinnishTranslationAiDoubleCheck',
            end: 'async function runAllFinnishTranslationAiDoubleChecks'
        },
        {
            name: 'Finnish double all',
            sourceName: 'finnish',
            id: 'finnish-translation-ai-double-check-run-all-btn',
            call: 'runAllFinnishTranslationAiDoubleChecks',
            start: 'async function runAllFinnishTranslationAiDoubleChecks',
            end: 'async function acceptFinnishTranslationAiCheck'
        }
    ];

    actions.forEach(action => {
        const actionSource = sourceBetween(appSource, action.start, action.end);
        assert.match(
            actionSource,
            new RegExp(`const instructions = translationReviewInstructions\\('${action.sourceName}'\\);`),
            `${action.name} must read the instructions for its own view.`
        );
        const bodies = jsonRequestBodies(actionSource);
        assert.equal(bodies.length, 1, `${action.name} must have one interactive JSON request body.`);
        assert.match(bodies[0], /(?:^|\n)\s*instructions,/, `${action.name} must send instructions.`);
        assertClickWiring(action.id, action.call);
    });
});

test('the shared review-jobs batch request snapshots instructions for first and double checks', () => {
    const batchSource = sourceBetween(
        appSource,
        "async function startTranslationReviewBatch(source = 'workspace'",
        'async function cancelTranslationReview'
    );
    assert.match(batchSource, /const instructions = translationReviewInstructions\(source\);/);
    assert.match(batchSource, /apiFetch\(`\/api\/translations\/\$\{item\.id\}\/review-jobs`/);
    const bodies = jsonRequestBodies(batchSource);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /(?:^|\n)\s*instructions,/);
    assert.match(bodies[0], /double_check:\s*doubleCheck/);

    assertClickWiring('translation-workspace-review-batch-btn', "startTranslationReviewBatch('workspace')");
    assertClickWiring(
        'translation-workspace-review-double-check-batch-btn',
        "startTranslationReviewBatch('workspace', null, { doubleCheck: true })"
    );
    assertClickWiring('finnish-translation-ai-check-batch-btn', "startTranslationReviewBatch('finnish')");
    assertClickWiring(
        'finnish-translation-ai-double-check-batch-btn',
        "startTranslationReviewBatch('finnish', null, { doubleCheck: true })"
    );
});

test('graphics HTML sends trimmed additional_instructions and invalidates stale output on edit', () => {
    const generateSource = sourceBetween(
        appSource,
        'async function generateGraphicsHtmlDraft',
        'function downloadGraphicsHtmlDraft'
    );
    assert.match(appSource, /const graphicsHtmlInstructions = document\.getElementById\('graphics-html-instructions'\);/);
    assert.match(generateSource, /apiFetch\('\/api\/marketing\/landing-page'/);
    assert.match(
        generateSource,
        /additional_instructions:\s*String\(graphicsHtmlInstructions\?\.value \|\| ''\)\.trim\(\)/
    );
    assert.match(appSource, /graphicsHtmlGenerateBtn\?\.addEventListener\('click', generateGraphicsHtmlDraft\);/);
    assert.match(
        appSource,
        /graphicsHtmlInstructions\?\.addEventListener\('input',[\s\S]{0,180}?clearGraphicsHtmlResult\(\)[\s\S]{0,120}?renderGraphicsHtmlWorkspace\(\)/
    );
});

test('instruction fields are disabled for their running operations and restored afterward', () => {
    const workspaceRender = sourceBetween(
        appSource,
        'function renderTranslationWorkspaceReview',
        'async function saveTranslationWorkspaceCurrent'
    );
    assert.match(workspaceRender, /instructionsInput\.disabled = translationWorkspaceReviewRunning/);

    const finnishRender = sourceBetween(
        appSource,
        'function renderFinnishTranslationAiCheck',
        'async function runFinnishTranslationAiCheck'
    );
    assert.match(finnishRender, /instructionsInput\.disabled = finnishTranslationAiCheckAllRunning/);

    const finnishSingle = sourceBetween(
        appSource,
        'async function runFinnishTranslationAiCheck',
        'async function runAllFinnishTranslationAiChecks'
    );
    const disableIndex = finnishSingle.indexOf('instructionsInput.disabled = true');
    const finallyIndex = finnishSingle.indexOf('finally');
    const restoreIndex = finnishSingle.indexOf('instructionsInput.disabled = false');
    assert.ok(disableIndex >= 0 && disableIndex < finallyIndex, 'Finnish single check must lock instructions before the request.');
    assert.ok(finallyIndex >= 0 && finallyIndex < restoreIndex, 'Finnish single check must restore instructions in finally.');

    const graphicsRender = sourceBetween(
        appSource,
        'function renderGraphicsHtmlWorkspace',
        'async function generateGraphicsHtmlDraft'
    );
    assert.match(graphicsRender, /graphicsHtmlInstructions\.disabled = graphicsHtmlGenerating/);
});

test('instruction styling remains responsive and cachebusters load the new assets', () => {
    assert.match(stylesSource, /\.graphics-html-instructions\s*\{/);
    assert.match(stylesSource, /\.graphics-html-instructions textarea:disabled\s*\{/);
    assert.match(stylesSource, /\.translation-review-instructions\s*\{/);
    assert.match(stylesSource, /\.translation-review-instructions textarea:disabled\s*\{/);
    assert.match(
        stylesSource,
        /@media \(max-width: 560px\)[\s\S]{0,500}?\.translation-review-instructions textarea\s*\{[\s\S]{0,120}?font-size:\s*16px/
    );
    assert.match(
        stylesSource,
        /@media \(max-width: 600px\)[\s\S]{0,4500}?\.marketing-html-form textarea\s*\{\s*font-size:\s*16px;\s*\}/
    );
    assert.match(
        stylesSource,
        /\.app-wrapper\.mobile-simulate \.translation-review-instructions textarea\s*\{[\s\S]{0,120}?font-size:\s*16px/
    );
    assert.match(
        stylesSource,
        /\.app-wrapper\.mobile-simulate \.marketing-html-form textarea\s*\{\s*font-size:\s*16px;\s*\}/
    );

    assert.match(indexSource, /href="styles\.css\?v=123"/);
    assert.match(indexSource, /src="app\.js\?v=226"/);
});
