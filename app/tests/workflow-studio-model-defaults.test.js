const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;

const storage = new Map();
global.localStorage = {
    getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
        storage.set(key, String(value));
    },
    removeItem(key) {
        storage.delete(key);
    }
};

require('../workflow-studio.js');

const textModels = [
    {
        provider: 'gemini',
        model_name: 'gemini-3.5-flash-lite',
        display_name: 'Gemini 3.5 Flash-Lite',
        model_tier: 'flash',
        task_type: 'text',
        is_enabled: true,
        is_default: false,
        is_demanding_default: false,
        cost_input_per_million: 0.1,
        cost_output_per_million: 0.4
    },
    {
        provider: 'gemini',
        model_name: 'gemini-3.8-flash',
        display_name: 'Gemini 3.8 Flash',
        model_tier: 'flash',
        task_type: 'text',
        is_enabled: true,
        is_default: true,
        is_demanding_default: true,
        supports_batch: true,
        cost_input_per_million: 0.75,
        cost_output_per_million: 3.75
    }
];

function response(data) {
    return { ok: true, json: async () => data };
}

async function apiFetch(url) {
    if (String(url).startsWith('/api/models/text')) return response(textModels);
    if (url === '/api/models/image') return response([]);
    throw new Error(`Unexpected request: ${url}`);
}

test('workflow leaves task defaults unresolved for the backend and estimates demanding steps with Gemini 3.8', async () => {
    storage.clear();
    const studio = global.SkriptLabWorkflowStudio.create({
        getProject: () => ({ title: 'no-project', content: 'Testikäsikirjoitus.' }),
        getUser: () => ({ id: 'default-user' }),
        apiFetch
    });

    await studio.init();
    const plan = studio.getPlan();

    for (const stepId of ['analysis', 'project_memory', 'proofread', 'misc']) {
        const step = plan.modules.find(item => item.id === stepId);
        const estimate = plan.estimate.modules.find(item => item.id === stepId);
        assert.equal(step.resolvedModel, '');
        assert.equal(estimate.model, 'gemini:gemini-3.8-flash');
    }
});

test('an explicit workflow text model still overrides the task-specific backend default', async () => {
    storage.clear();
    storage.set('skriptlab.workflow-studio.v2.override-user.no-project.plan', JSON.stringify({
        version: 2,
        templateId: 'writer',
        modules: [
            { id: 'analysis', runMode: 'direct', modelOverride: '' },
            { id: 'proofread', runMode: 'direct', modelOverride: '' }
        ],
        settings: {
            textModel: 'gemini:gemini-3.5-flash-lite',
            translationModel: '',
            imageModel: '',
            audioModel: '',
            sourceLanguage: 'auto',
            targetLanguage: 'en',
            chunkWords: 2000,
            strategy: 'balanced'
        }
    }));
    const studio = global.SkriptLabWorkflowStudio.create({
        getProject: () => ({ title: 'no-project', content: 'Testikäsikirjoitus.' }),
        getUser: () => ({ id: 'override-user' }),
        apiFetch
    });

    await studio.init();
    const plan = studio.getPlan();

    for (const step of plan.modules) {
        assert.equal(step.resolvedModel, 'gemini:gemini-3.5-flash-lite');
    }
});
