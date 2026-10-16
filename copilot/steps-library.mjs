export const STEPS_LIBRARY = [
  { match: /electricity|water|phone bill|pay .*bill|bill/i, steps: ['Open the bill', 'Check the amount and due date', 'Pay it', 'Save the confirmation'] },
  { match: /book .*appointment|doctor|dentist|haircut/i, steps: ['Open the booking page or phone', 'Choose a suitable time', 'Book the appointment', 'Add it to the calendar'] },
  { match: /phone call|call .*|ring /i, steps: ['Find the number', 'Write one sentence about what you need', 'Make the call', 'Note the next step'] },
  { match: /reply to emails|email replies|reply .*email/i, steps: ['Open the email list', 'Choose the first reply', 'Write a short response', 'Send it and mark it done'] },
  { match: /reply to enquiries|enquir/i, steps: ['Open the enquiry list', 'Pick one enquiry', 'Draft a brief reply', 'Record the follow-up'] },
  { match: /reconcil.*claims|claims batch/i, steps: ['Open the report', 'Filter to exceptions', 'Check each exception', 'Record follow-ups', 'Mark the batch done'] },
  { match: /invoice processing|process .*invoice/i, steps: ['Open the invoice queue', 'Check the first invoice', 'Match it to the record', 'Record the outcome'] },
  { match: /staff follow.?up/i, steps: ['Open the follow-up list', 'Choose one item', 'Send a short check-in', 'Note the response or next date'] },
  { match: /training document|update .*training/i, steps: ['Open the document', 'Find the section to update', 'Make one clear change', 'Check and save it'] },
  { match: /team meeting notes|meeting notes/i, steps: ['Open a blank note', 'Add the meeting date', 'Write the key decisions', 'List owners and next steps'] },
  { match: /school form|permission note/i, steps: ['Get the form', 'Fill in the first section', 'Check the details', 'Sign and return it'] },
  { match: /cook dinner|dinner/i, steps: ['Get out the recipe and ingredients', 'Do the first prep step', 'Cook the main parts', 'Serve dinner and save leftovers'] },
  { match: /meal prep/i, steps: ['Clear one small bench space', 'Choose the meals', 'Prepare the first ingredients', 'Pack and label the food'] },
  { match: /kitchen reset/i, steps: ['Put one thing in the dishwasher', 'Clear the bench', 'Wipe the main surface', 'Set out what morning needs'] },
  { match: /laundry wash|wash laundry|start washing/i, steps: ['Gather one load', 'Put it in the machine', 'Add detergent and start it', 'Set a reminder to hang it out'] },
  { match: /fold washing|fold laundry/i, steps: ['Bring one basket over', 'Fold five easy items', 'Put away one small pile', 'Pause or finish the basket'] },
  { match: /clean bathroom/i, steps: ['Get the cloth and cleaner', 'Wipe the sink', 'Clean the toilet', 'Replace the hand towel'] },
  { match: /vacuum/i, steps: ['Get the vacuum out', 'Clear one walking path', 'Vacuum the busiest area', 'Put the vacuum away'] },
  { match: /grocery list/i, steps: ['Open the shopping list', 'Check the next meal', 'Add the missing basics', 'Save the list'] },
  { match: /grocery shop|food shop/i, steps: ['Open the shopping list', 'Get a bag and keys', 'Shop for the first few items', 'Check off the rest as you go'] },
  { match: /tidy .*room|tidy one room/i, steps: ['Get one empty basket', 'Pick up things on the floor', 'Put away five items', 'Choose one last small surface'] },
  { match: /declutter .*drawer|declutter/i, steps: ['Open one drawer', 'Take out one item', 'Keep, move or let it go', 'Stop when the timer ends'] },
  { match: /household budget|budget check/i, steps: ['Open the Finance app', 'Review uncategorised items', 'Check bills due in seven days', 'Write down actions to take'] },
  { match: /tax|receipts/i, steps: ['Open the receipts folder', 'Gather five receipts', 'Label or file them', 'Note anything still missing'] },
  { match: /renew .*registration|renew .*insurance|registration|insurance/i, steps: ['Find the renewal notice', 'Check the due date', 'Open the renewal page', 'Save the confirmation'] },
  { match: /p&c|treasurer reconciliation/i, steps: ['Open the reconciliation sheet', 'Check the latest statement', 'Match one transaction', 'Record any follow-up'] },
  { match: /etsy .*listing|listing .*etsy|etsy listing/i, steps: ['Open the listing draft', 'Check the product title', 'Add the description sections', 'Review tags and publish when ready'] },
  { match: /etsy .*mockup|mockup/i, steps: ['Open the artwork file', 'Choose one mockup template', 'Place the artwork', 'Export and check the image'] },
  { match: /etsy .*price|price and profit/i, steps: ['Open the price notes', 'Add the material and fee costs', 'Check the profit estimate', 'Save the final price'] },
  { match: /return|exchange/i, steps: ['Find the receipt', 'Check the return window', 'Pack the item', 'Book or make the return'] },
  { match: /birthday gift|gift/i, steps: ['Write the person’s name', 'Choose one gift idea', 'Check the budget', 'Order or add it to the list'] },
];

export function stepsFor(task, library = STEPS_LIBRARY) {
  if (Array.isArray(task?.recipeSteps) && task.recipeSteps.length) {
    return task.recipeSteps.map((title, index) => ({ id: `step-${index + 1}`, title: String(title), done: false }));
  }
  const match = library.find(entry => entry.match.test(String(task?.title || '')));
  const titles = match?.steps || [
    `Get out what you need for: ${task?.title || 'this task'}`,
    'Do the first small part',
    'Keep going for 10 minutes',
    'Check what is left and finish or pause',
  ];
  return titles.map((title, index) => ({ id: `step-${index + 1}`, title, done: false }));
}

export function shrinkStep(step, task) {
  const original = String(step?.title || step || task?.title || 'this step');
  const item = original.replace(/^(open|get out|find|gather|choose|check|write|start)\s+/i, '').trim();
  const first = /^(open|get out|find|gather|choose|check|write|start)\s+/i.test(original)
    ? `Just ${original[0].toLowerCase()}${original.slice(1)}`
    : `Just open or get out ${item}`;
  return [
    { id: `micro-${Date.now().toString(36)}-1`, title: first, done: false },
    { id: `micro-${Date.now().toString(36)}-2`, title: 'Do 2 minutes of it', done: false },
    { id: `micro-${Date.now().toString(36)}-3`, title: original, done: false },
  ];
}
