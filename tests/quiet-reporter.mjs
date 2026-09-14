// Test failures must not dump encrypted-page source or personal fixture strings.
export default async function* reporter(events){let passed=0,failed=0;for await(const e of events){if(e.type==='test:pass'){passed++;}if(e.type==='test:fail'){failed++;yield `FAIL ${e.data.name}\n`;}if(e.type==='test:summary'&&e.data.file===undefined)yield `Tests: ${passed} passed, ${failed} failed\n`;}}
