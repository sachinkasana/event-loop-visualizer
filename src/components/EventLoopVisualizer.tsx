import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Zap, Clock, Database, Code, ChevronLeft, ChevronRight, SkipBack, SkipForward, MessageSquare, Edit3, Timer, Activity, BarChart3, Share2, HelpCircle, Download, X, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';

interface WebAPIItem {
  label: string;
  callback: string;
}

interface Step {
  action: string;
  item?: string;
  execute?: boolean;
  line?: number;
  message?: string;
  from?: string;
  callback?: string;
  explanation?: string;
}

interface Example {
  name: string;
  description: string;
  code: string;
  steps: Step[];
}

type ExampleKey = 'basic' | 'promise' | 'advanced' | 'fetch' | 'asyncAwait' | 'multiplePromises' | 'eventListener' | 'apiError' | 'debounce' | 'promiseRace' | 'requestAnimationFrame' | 'custom';
type StaticExampleKey = Exclude<ExampleKey, 'custom'>;

const EventLoopVisualizer = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1000);
  const [callStack, setCallStack] = useState<string[]>([]);
  const [taskQueue, setTaskQueue] = useState<string[]>([]);
  const [microTaskQueue, setMicroTaskQueue] = useState<string[]>([]);
  const [webAPIs, setWebAPIs] = useState<WebAPIItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedExample, setSelectedExample] = useState<ExampleKey>('basic');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<string>('Click "Start" or "Next" to begin stepping through the code execution.');
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [customCode, setCustomCode] = useState<string>('');
  const [codeError, setCodeError] = useState<string>('');
  const [customExample, setCustomExample] = useState<Example>({
    name: 'Custom Code',
    description: 'Your custom example',
    code: '',
    steps: []
  });
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);
  
  // UI state
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showShareToast, setShowShareToast] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  
  // Performance indicators
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [eventLoopCycles, setEventLoopCycles] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);

  const examples: Record<StaticExampleKey, Example> = {
    basic: {
      name: 'Basic Example',
      description: 'Simple setTimeout and console.log',
      code: `console.log("Start");

setTimeout(() => {
  console.log("Timeout");
}, 0);

console.log("End");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Start")', execute: true, line: 1, explanation: 'Synchronous code executes immediately. console.log("Start") is pushed to the call stack.' },
        { action: 'log', message: 'Start', explanation: 'The function executes and prints "Start" to the console.' },
        { action: 'removeFromStack', explanation: 'console.log completes and is removed from the call stack.' },
        { action: 'addToStack', item: 'setTimeout(cb, 0)', execute: false, line: 3, explanation: 'setTimeout is called and pushed to the call stack. Even with 0ms delay, the callback is not executed immediately.' },
        { action: 'addToWebAPI', item: 'Timer: 0ms', callback: 'console.log("Timeout")', explanation: 'The browser\'s Web API takes over the timer. The callback is registered to execute after 0ms.' },
        { action: 'removeFromStack', explanation: 'setTimeout completes its job (registering the timer) and is removed from the stack.' },
        { action: 'addToStack', item: 'console.log("End")', execute: true, line: 7, explanation: 'The next synchronous line executes. console.log("End") is pushed to the call stack.' },
        { action: 'log', message: 'End', explanation: 'Prints "End" to the console. Notice how this runs before "Timeout"!' },
        { action: 'removeFromStack', explanation: 'console.log("End") completes and the call stack is now empty.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'console.log("Timeout")', line: 4, explanation: 'The timer completes and the callback moves from Web APIs to the Task Queue, waiting for execution.' },
        { action: 'checkEventLoop', explanation: 'Event Loop checks: Is the call stack empty? Yes! It takes the first task from the Task Queue.' },
        { action: 'addToStack', item: 'console.log("Timeout")', execute: true, line: 4, explanation: 'The setTimeout callback is now pushed to the call stack and executes.' },
        { action: 'log', message: 'Timeout', explanation: 'Finally prints "Timeout" to the console.' },
        { action: 'removeFromStack', explanation: 'Callback completes. All done! Output order: Start → End → Timeout' }
      ]
    },
    promise: {
      name: 'Promises & Microtasks',
      description: 'Shows microtask priority',
      code: `console.log("Start");

setTimeout(() => {
  console.log("Timeout");
}, 0);

Promise.resolve().then(() => {
  console.log("Promise");
});

console.log("End");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Start")', execute: true, line: 1, explanation: 'First synchronous statement executes immediately.' },
        { action: 'log', message: 'Start', explanation: 'Prints "Start" to console.' },
        { action: 'removeFromStack', explanation: 'Removed from call stack after execution.' },
        { action: 'addToStack', item: 'setTimeout(cb, 0)', execute: false, line: 3, explanation: 'setTimeout registers a callback to execute after 0ms.' },
        { action: 'addToWebAPI', item: 'Timer: 0ms', callback: 'console.log("Timeout")', explanation: 'Browser\'s Web API handles the timer. Callback will go to Task Queue after completion.' },
        { action: 'removeFromStack', explanation: 'setTimeout registration completes.' },
        { action: 'addToStack', item: 'Promise.resolve()', execute: false, line: 7, explanation: 'Promise.resolve() creates an immediately resolved promise.' },
        { action: 'addToMicroTask', item: 'console.log("Promise")', explanation: 'Promise callbacks go to the Microtask Queue, which has HIGHER priority than the Task Queue!' },
        { action: 'removeFromStack', explanation: 'Promise registration completes.' },
        { action: 'addToStack', item: 'console.log("End")', execute: true, line: 11, explanation: 'Next synchronous statement executes.' },
        { action: 'log', message: 'End', explanation: 'Prints "End" to console.' },
        { action: 'removeFromStack', explanation: 'Call stack is now empty. Time for the Event Loop to work!' },
        { action: 'processMicroTasks', line: 8, explanation: 'Event Loop processes ALL microtasks FIRST before checking the Task Queue. This is why Promises execute before setTimeout!' },
        { action: 'addToStack', item: 'console.log("Promise")', execute: true, line: 8, explanation: 'Promise callback executes from Microtask Queue.' },
        { action: 'log', message: 'Promise', explanation: 'Prints "Promise" to console.' },
        { action: 'removeFromStack', explanation: 'Promise callback completes.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'console.log("Timeout")', line: 4, explanation: 'Timer completes and callback moves to Task Queue.' },
        { action: 'checkEventLoop', explanation: 'All microtasks are done. Now Event Loop takes one task from Task Queue.' },
        { action: 'addToStack', item: 'console.log("Timeout")', execute: true, line: 4, explanation: 'setTimeout callback finally executes.' },
        { action: 'log', message: 'Timeout', explanation: 'Prints "Timeout" to console. Order: Start → End → Promise → Timeout' },
        { action: 'removeFromStack', explanation: 'All done! Key takeaway: Microtasks always execute before Tasks.' }
      ]
    },
    advanced: {
      name: 'Advanced Pattern',
      description: 'Multiple async operations',
      code: `console.log("1");

setTimeout(() => {
  console.log("2");
}, 100);

setTimeout(() => {
  console.log("3");
}, 0);

Promise.resolve().then(() => {
  console.log("4");
});

console.log("5");`,
      steps: [
        { action: 'addToStack', item: 'console.log("1")', execute: true, line: 1, explanation: 'First synchronous operation executes immediately.' },
        { action: 'log', message: '1', explanation: 'Output: 1' },
        { action: 'removeFromStack', explanation: 'Removed from stack.' },
        { action: 'addToStack', item: 'setTimeout(cb, 100)', execute: false, line: 3, explanation: 'Registers a timer with 100ms delay.' },
        { action: 'addToWebAPI', item: 'Timer: 100ms', callback: 'console.log("2")', explanation: 'This callback will wait 100ms before being ready.' },
        { action: 'removeFromStack', explanation: 'setTimeout completes registration.' },
        { action: 'addToStack', item: 'setTimeout(cb, 0)', execute: false, line: 7, explanation: 'Registers another timer with 0ms delay.' },
        { action: 'addToWebAPI', item: 'Timer: 0ms', callback: 'console.log("3")', explanation: 'This timer completes almost immediately but still goes through Web APIs.' },
        { action: 'removeFromStack', explanation: 'Second setTimeout completes.' },
        { action: 'addToStack', item: 'Promise.resolve()', execute: false, line: 11, explanation: 'Creates an immediately resolved promise.' },
        { action: 'addToMicroTask', item: 'console.log("4")', explanation: 'Promise callback goes to Microtask Queue (higher priority!)' },
        { action: 'removeFromStack', explanation: 'Promise setup completes.' },
        { action: 'addToStack', item: 'console.log("5")', execute: true, line: 15, explanation: 'Last synchronous operation.' },
        { action: 'log', message: '5', explanation: 'Output: 5. All sync code is done!' },
        { action: 'removeFromStack', explanation: 'Call stack is empty. Event Loop activates!' },
        { action: 'processMicroTasks', line: 12, explanation: 'Event Loop MUST process ALL microtasks before any task from Task Queue.' },
        { action: 'addToStack', item: 'console.log("4")', execute: true, line: 12, explanation: 'Promise callback executes from Microtask Queue.' },
        { action: 'log', message: '4', explanation: 'Output: 4' },
        { action: 'removeFromStack', explanation: 'Microtask complete. Now checking Task Queue...' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'console.log("3")', line: 8, explanation: 'The 0ms timer completed and moved to Task Queue.' },
        { action: 'checkEventLoop', explanation: 'Event Loop takes the first task from Task Queue.' },
        { action: 'addToStack', item: 'console.log("3")', execute: true, line: 8, explanation: 'First setTimeout callback (0ms delay) executes.' },
        { action: 'log', message: '3', explanation: 'Output: 3' },
        { action: 'removeFromStack', explanation: 'Task complete. Event Loop continues...' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'console.log("2")', line: 4, explanation: 'The 100ms timer completed and moved to Task Queue.' },
        { action: 'checkEventLoop', explanation: 'Event Loop takes the next task.' },
        { action: 'addToStack', item: 'console.log("2")', execute: true, line: 4, explanation: 'Second setTimeout callback (100ms delay) executes last.' },
        { action: 'log', message: '2', explanation: 'Output: 2. Final order: 1 → 5 → 4 → 3 → 2' },
        { action: 'removeFromStack', explanation: 'All operations complete! Notice: sync first, then microtasks, then tasks by timing.' }
      ]
    },
    fetch: {
      name: 'Fetch API',
      description: 'Async/await with fetch simulation',
      code: `console.log("Start fetch");

fetch('/api/data')
  .then(res => res.json())
  .then(data => {
    console.log("Data received");
  });

console.log("Fetch initiated");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Start fetch")', execute: true, line: 1, explanation: 'Starting the fetch operation sequence.' },
        { action: 'log', message: 'Start fetch', explanation: 'Output: Start fetch' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'fetch("/api/data")', execute: false, line: 3, explanation: 'fetch() initiates an HTTP request. This is handled by the browser\'s Web API.' },
        { action: 'addToWebAPI', item: 'Fetch: /api/data', callback: 'Promise.then()', explanation: 'The network request is processed by Web APIs. When complete, the .then() callback will be queued.' },
        { action: 'removeFromStack', explanation: 'fetch() registration completes immediately (non-blocking!)' },
        { action: 'addToStack', item: 'console.log("Fetch initiated")', execute: true, line: 9, explanation: 'Code continues executing while the fetch happens in the background.' },
        { action: 'log', message: 'Fetch initiated', explanation: 'Output: Fetch initiated. Notice this runs before data is received!' },
        { action: 'removeFromStack', explanation: 'All synchronous code complete.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'Promise.then()', line: 4, explanation: 'Fetch completes. The response promise resolves and the .then() callback is queued.' },
        { action: 'addToMicroTask', item: 'res.json()', explanation: 'res.json() returns a promise, adding to Microtask Queue.' },
        { action: 'processMicroTasks', line: 5, explanation: 'Processing the JSON parsing microtask.' },
        { action: 'addToMicroTask', item: 'console.log("Data received")', explanation: 'Second .then() callback is queued as a microtask.' },
        { action: 'processMicroTasks', line: 6, explanation: 'Now executing the final .then() callback.' },
        { action: 'addToStack', item: 'console.log("Data received")', execute: true, line: 6, explanation: 'The data handling callback executes.' },
        { action: 'log', message: 'Data received', explanation: 'Output: Data received. Fetch complete!' },
        { action: 'removeFromStack', explanation: 'Fetch operation fully complete. Order shows non-blocking nature of fetch!' }
      ]
    },
    asyncAwait: {
      name: 'Async/Await',
      description: 'Modern async syntax',
      code: `console.log("Before async");

async function getData() {
  console.log("In async");
  const data = await Promise.resolve("data");
  console.log("After await");
}

getData();
console.log("After call");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Before async")', execute: true, line: 1, explanation: 'First synchronous line executes.' },
        { action: 'log', message: 'Before async', explanation: 'Output: Before async' },
        { action: 'removeFromStack', explanation: 'Removed from stack.' },
        { action: 'addToStack', item: 'getData()', execute: false, line: 9, explanation: 'Calling the async function. Async functions always return a Promise!' },
        { action: 'addToStack', item: 'console.log("In async")', execute: true, line: 4, explanation: 'Code before await executes synchronously, just like normal.' },
        { action: 'log', message: 'In async', explanation: 'Output: In async' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'await Promise.resolve()', execute: false, line: 5, explanation: 'await pauses execution! The function "yields" control back to the caller.' },
        { action: 'addToMicroTask', item: 'Resume: After await', explanation: 'The continuation (code after await) is scheduled as a microtask.' },
        { action: 'removeFromStack', explanation: 'await causes the function to return to caller.' },
        { action: 'removeFromStack', explanation: 'getData() call completes (returns a pending Promise).' },
        { action: 'addToStack', item: 'console.log("After call")', execute: true, line: 10, explanation: 'Code continues executing while await is waiting!' },
        { action: 'log', message: 'After call', explanation: 'Output: After call. This runs before "After await"!' },
        { action: 'removeFromStack', explanation: 'All sync code done. Now microtasks can run.' },
        { action: 'processMicroTasks', line: 6, explanation: 'Event Loop processes microtasks. Time to resume the async function!' },
        { action: 'addToStack', item: 'console.log("After await")', execute: true, line: 6, explanation: 'Async function resumes after the await. data variable now has the resolved value.' },
        { action: 'log', message: 'After await', explanation: 'Output: After await. Key learning: await = "pause and come back later"' },
        { action: 'removeFromStack', explanation: 'Async function completes. Order: Before async → In async → After call → After await' }
      ]
    },
    multiplePromises: {
      name: 'Chained Promises',
      description: 'Multiple promise chains',
      code: `console.log("Start");

Promise.resolve()
  .then(() => console.log("Promise 1"))
  .then(() => console.log("Promise 2"));

Promise.resolve()
  .then(() => console.log("Promise 3"));

console.log("End");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Start")', execute: true, line: 1, explanation: 'Starting execution with synchronous code.' },
        { action: 'log', message: 'Start', explanation: 'Output: Start' },
        { action: 'removeFromStack', explanation: 'Removed from stack.' },
        { action: 'addToStack', item: 'Promise.resolve()', execute: false, line: 3, explanation: 'First promise chain starts. Promise.resolve() creates an immediately resolved promise.' },
        { action: 'addToMicroTask', item: 'console.log("Promise 1")', explanation: 'First .then() callback queued to Microtask Queue.' },
        { action: 'removeFromStack', explanation: 'Promise registration completes.' },
        { action: 'addToStack', item: 'Promise.resolve()', execute: false, line: 7, explanation: 'Second independent promise chain starts.' },
        { action: 'addToMicroTask', item: 'console.log("Promise 3")', explanation: 'This .then() callback also queued to Microtask Queue.' },
        { action: 'removeFromStack', explanation: 'Second promise registered.' },
        { action: 'addToStack', item: 'console.log("End")', execute: true, line: 10, explanation: 'Final synchronous statement.' },
        { action: 'log', message: 'End', explanation: 'Output: End. All sync code done!' },
        { action: 'removeFromStack', explanation: 'Stack empty. Event Loop will now process microtasks.' },
        { action: 'processMicroTasks', line: 4, explanation: 'Processing first microtask: "Promise 1" callback.' },
        { action: 'addToStack', item: 'console.log("Promise 1")', execute: true, line: 4, explanation: 'First promise callback executes.' },
        { action: 'log', message: 'Promise 1', explanation: 'Output: Promise 1' },
        { action: 'removeFromStack', explanation: 'Callback completes. The .then() returns a new promise!' },
        { action: 'addToMicroTask', item: 'console.log("Promise 2")', explanation: 'Chained .then() creates another microtask. Added to the end of Microtask Queue.' },
        { action: 'processMicroTasks', line: 8, explanation: 'Processing next microtask: "Promise 3" callback (was already queued).' },
        { action: 'addToStack', item: 'console.log("Promise 3")', execute: true, line: 8, explanation: 'Second promise chain\'s callback executes.' },
        { action: 'log', message: 'Promise 3', explanation: 'Output: Promise 3' },
        { action: 'removeFromStack', explanation: 'Second chain\'s first callback done.' },
        { action: 'processMicroTasks', line: 5, explanation: 'Processing the chained callback from first promise.' },
        { action: 'addToStack', item: 'console.log("Promise 2")', execute: true, line: 5, explanation: 'Final callback from the first promise chain.' },
        { action: 'log', message: 'Promise 2', explanation: 'Output: Promise 2. Order: Start → End → Promise 1 → Promise 3 → Promise 2' },
        { action: 'removeFromStack', explanation: 'All done! Notice how chained promises queue new microtasks.' }
      ]
    },
    eventListener: {
      name: 'Event Listeners',
      description: 'Click event handling',
      code: `console.log("Setup");

button.addEventListener('click', () => {
  console.log("Button clicked");
  Promise.resolve().then(() => {
    console.log("After click");
  });
});

console.log("Ready");
// User clicks button here`,
      steps: [
        { action: 'addToStack', item: 'console.log("Setup")', execute: true, line: 1, explanation: 'Starting to set up event listeners.' },
        { action: 'log', message: 'Setup', explanation: 'Output: Setup' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'addEventListener("click", cb)', execute: false, line: 3, explanation: 'Registering a click event listener. The callback is stored but NOT executed yet.' },
        { action: 'addToWebAPI', item: 'Event: click listener', callback: 'click handler', explanation: 'Browser registers the event listener. It will trigger when the user clicks the button.' },
        { action: 'removeFromStack', explanation: 'Event listener registration complete.' },
        { action: 'addToStack', item: 'console.log("Ready")', execute: true, line: 10, explanation: 'Synchronous code continues executing.' },
        { action: 'log', message: 'Ready', explanation: 'Output: Ready. Now waiting for user interaction...' },
        { action: 'removeFromStack', explanation: 'All setup code complete. Application is now idle, waiting for events.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'click handler', line: 4, explanation: '🖱️ User clicks the button! Event handler is queued as a Task.' },
        { action: 'checkEventLoop', explanation: 'Event Loop picks up the click event from Task Queue.' },
        { action: 'addToStack', item: 'console.log("Button clicked")', execute: true, line: 4, explanation: 'Click handler executes. First line in the callback runs.' },
        { action: 'log', message: 'Button clicked', explanation: 'Output: Button clicked' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'Promise.resolve()', execute: false, line: 5, explanation: 'Promise created inside the event handler.' },
        { action: 'addToMicroTask', item: 'console.log("After click")', explanation: 'Promise callback queued as microtask. Will run after current task completes.' },
        { action: 'removeFromStack', explanation: 'Promise setup done.' },
        { action: 'removeFromStack', explanation: 'Click handler completes. Now Event Loop processes microtasks before next task.' },
        { action: 'processMicroTasks', line: 6, explanation: 'Microtasks run immediately after the task completes (before rendering!)' },
        { action: 'addToStack', item: 'console.log("After click")', execute: true, line: 6, explanation: 'Promise callback from the click handler executes.' },
        { action: 'log', message: 'After click', explanation: 'Output: After click. Event handling complete!' },
        { action: 'removeFromStack', explanation: 'Done! Key learning: Event handlers are Tasks, but can create Microtasks inside them.' }
      ]
    },
    apiError: {
      name: 'API Error Handling',
      description: 'Fetch with try-catch',
      code: `console.log("Fetching user");

async function getUser() {
  try {
    const res = await fetch('/user');
    console.log("Success");
  } catch (error) {
    console.log("Error caught");
  }
}

getUser();
console.log("Request sent");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Fetching user")', execute: true, line: 1, explanation: 'Starting an async operation with error handling.' },
        { action: 'log', message: 'Fetching user', explanation: 'Output: Fetching user' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'getUser()', execute: false, line: 12, explanation: 'Calling the async function. Remember: async functions return immediately with a Promise!' },
        { action: 'addToStack', item: 'await fetch("/user")', execute: false, line: 5, explanation: 'fetch() starts the network request. await pauses the function execution.' },
        { action: 'addToWebAPI', item: 'Fetch: /user', callback: 'Resume getUser', explanation: 'Network request handled by browser APIs. Function paused at await.' },
        { action: 'removeFromStack', explanation: 'await causes function to yield. Execution continues outside the function.' },
        { action: 'removeFromStack', explanation: 'getUser() returns to caller (returns pending Promise).' },
        { action: 'addToStack', item: 'console.log("Request sent")', execute: true, line: 13, explanation: 'Code after function call executes while fetch is in progress!' },
        { action: 'log', message: 'Request sent', explanation: 'Output: Request sent. Non-blocking async in action!' },
        { action: 'removeFromStack', explanation: 'All sync code done. Now waiting for fetch to complete...' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'Resume getUser', line: 5, explanation: '❌ Fetch fails (network error, 404, etc). The promise REJECTS.' },
        { action: 'addToMicroTask', item: 'catch(error)', explanation: 'Rejection triggers the catch block! This is queued as a microtask.' },
        { action: 'processMicroTasks', line: 8, explanation: 'Processing the error handler microtask.' },
        { action: 'addToStack', item: 'console.log("Error caught")', execute: true, line: 8, explanation: 'Catch block executes. The try-catch successfully handled the error!' },
        { action: 'log', message: 'Error caught', explanation: 'Output: Error caught. Error handled gracefully without crashing!' },
        { action: 'removeFromStack', explanation: 'Error handling complete. Key: await errors are caught by try-catch!' }
      ]
    },
    debounce: {
      name: 'Debounce Pattern',
      description: 'Real-world search debouncing',
      code: `let timeout;

function onSearch(text) {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    console.log("Search: " + text);
  }, 300);
}

onSearch("H");
onSearch("He");
onSearch("Hel");`,
      steps: [
        { action: 'addToStack', item: 'onSearch("H")', execute: false, line: 10, explanation: 'User types "H". First keystroke triggers search function.' },
        { action: 'addToStack', item: 'clearTimeout(timeout)', execute: true, line: 4, explanation: 'Checking if there\'s a pending timer. First call, so timeout is undefined - nothing to clear.' },
        { action: 'removeFromStack', explanation: 'clearTimeout completes (no-op for undefined).' },
        { action: 'addToStack', item: 'setTimeout(cb, 300)', execute: false, line: 5, explanation: 'Starting a 300ms timer before executing the search.' },
        { action: 'addToWebAPI', item: 'Timer: 300ms (H)', callback: 'console.log("Search: H")', explanation: 'Timer set for 300ms. If no more typing happens, it will execute the search.' },
        { action: 'removeFromStack', explanation: 'setTimeout registration done.' },
        { action: 'removeFromStack', explanation: 'First onSearch call complete. Timer is running...' },
        { action: 'addToStack', item: 'onSearch("He")', execute: false, line: 11, explanation: '⌨️ User types "e" (only 50ms later). Second keystroke!' },
        { action: 'addToStack', item: 'clearTimeout(timeout)', execute: true, line: 4, explanation: 'CANCELING the previous timer! This prevents the "H" search from executing.' },
        { action: 'removeFromStack', explanation: 'Previous timer cancelled. First search will never run!' },
        { action: 'addToWebAPI', item: 'Timer: 300ms (He)', callback: 'console.log("Search: He")', explanation: 'New timer started for "He". Restarting the 300ms countdown.' },
        { action: 'removeFromStack', explanation: 'Second onSearch complete.' },
        { action: 'addToStack', item: 'onSearch("Hel")', execute: false, line: 12, explanation: '⌨️ User types "l" quickly. Third keystroke!' },
        { action: 'addToStack', item: 'clearTimeout(timeout)', execute: true, line: 4, explanation: 'CANCELING the "He" timer! Previous search prevented again.' },
        { action: 'removeFromStack', explanation: 'Second timer cancelled. "He" search will never run!' },
        { action: 'addToWebAPI', item: 'Timer: 300ms (Hel)', callback: 'console.log("Search: Hel")', explanation: 'Final timer for "Hel". If user stops typing, this will execute after 300ms.' },
        { action: 'removeFromStack', explanation: 'Third onSearch complete.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'console.log("Search: Hel")', line: 6, explanation: '⏱️ 300ms passed with no more keystrokes. Timer completes and queues the callback.' },
        { action: 'checkEventLoop', explanation: 'Event Loop picks up the search task.' },
        { action: 'addToStack', item: 'console.log("Search: Hel")', execute: true, line: 6, explanation: 'Finally executing the search! Only the last timer survived.' },
        { action: 'log', message: 'Search: Hel', explanation: 'Output: Search: Hel. Debouncing saved 2 unnecessary API calls! (H and He never searched)' },
        { action: 'removeFromStack', explanation: 'Complete! This pattern is crucial for search boxes, resize handlers, and scroll events.' }
      ]
    },
    promiseRace: {
      name: 'Promise.race',
      description: 'Timeout pattern with race',
      code: `console.log("Start request");

const timeout = new Promise((_, reject) => {
  setTimeout(() => reject("Timeout"), 1000);
});

const request = fetch('/slow-api');

Promise.race([request, timeout])
  .then(() => console.log("Success"))
  .catch(() => console.log("Failed"));

console.log("Racing...");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Start request")', execute: true, line: 1, explanation: 'Starting a request with a timeout using Promise.race pattern.' },
        { action: 'log', message: 'Start request', explanation: 'Output: Start request' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'new Promise((_, reject)...)', execute: false, line: 3, explanation: 'Creating a promise that will reject after 1000ms. This is our timeout mechanism.' },
        { action: 'addToStack', item: 'setTimeout(cb, 1000)', execute: false, line: 4, explanation: 'Setting up the timeout timer.' },
        { action: 'addToWebAPI', item: 'Timer: 1000ms', callback: 'reject("Timeout")', explanation: 'Timeout timer registered. Will reject the promise if it fires.' },
        { action: 'removeFromStack', explanation: 'setTimeout done.' },
        { action: 'removeFromStack', explanation: 'Timeout promise created.' },
        { action: 'addToStack', item: 'fetch("/slow-api")', execute: false, line: 7, explanation: 'Starting the actual API request.' },
        { action: 'addToWebAPI', item: 'Fetch: /slow-api', callback: 'resolve(response)', explanation: 'Network request in progress. Simulating a slow API.' },
        { action: 'removeFromStack', explanation: 'Fetch initiated.' },
        { action: 'addToStack', item: 'Promise.race([...])', execute: false, line: 9, explanation: 'Promise.race returns as soon as the FIRST promise settles (resolves or rejects)!' },
        { action: 'removeFromStack', explanation: 'Race setup complete. Now both promises are competing...' },
        { action: 'addToStack', item: 'console.log("Racing...")', execute: true, line: 13, explanation: 'Synchronous code continues while both async operations are in progress.' },
        { action: 'log', message: 'Racing...', explanation: 'Output: Racing... Both timeout and fetch are now racing!' },
        { action: 'removeFromStack', explanation: 'All sync code done. Now we wait to see which promise wins...' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'reject("Timeout")', line: 4, explanation: '⏱️ 1000ms elapsed! Timeout fires BEFORE the slow API responds. Timeout wins the race!' },
        { action: 'addToMicroTask', item: 'catch(() => console.log("Failed"))', explanation: 'Race promise rejected. The .catch() handler is queued.' },
        { action: 'processMicroTasks', line: 11, explanation: 'Processing the rejection handler.' },
        { action: 'addToStack', item: 'console.log("Failed")', execute: true, line: 11, explanation: 'Catch handler executes. Request failed due to timeout!' },
        { action: 'log', message: 'Failed', explanation: 'Output: Failed. The slow API never got a chance to respond!' },
        { action: 'removeFromStack', explanation: 'Done! Promise.race is perfect for implementing request timeouts.' }
      ]
    },
    requestAnimationFrame: {
      name: 'Animation Frame',
      description: 'RAF for smooth animations',
      code: `console.log("Animation start");

let count = 0;
function animate() {
  console.log("Frame " + count++);
  if (count < 3) {
    requestAnimationFrame(animate);
  }
}

requestAnimationFrame(animate);
console.log("Scheduled");`,
      steps: [
        { action: 'addToStack', item: 'console.log("Animation start")', execute: true, line: 1, explanation: 'Starting an animation using requestAnimationFrame (RAF).' },
        { action: 'log', message: 'Animation start', explanation: 'Output: Animation start' },
        { action: 'removeFromStack', explanation: 'Console.log completes.' },
        { action: 'addToStack', item: 'requestAnimationFrame(animate)', execute: false, line: 11, explanation: 'RAF schedules a callback to run before the next repaint (~60fps = every 16ms).' },
        { action: 'addToWebAPI', item: 'RAF: animate (Frame 0)', callback: 'animate()', explanation: 'Browser schedules animate() to run before next paint. Different queue than setTimeout!' },
        { action: 'removeFromStack', explanation: 'RAF registration complete.' },
        { action: 'addToStack', item: 'console.log("Scheduled")', execute: true, line: 12, explanation: 'Synchronous code continues immediately.' },
        { action: 'log', message: 'Scheduled', explanation: 'Output: Scheduled. Animation callback will run on next frame.' },
        { action: 'removeFromStack', explanation: 'All sync code done. Browser will call our callback before painting...' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'animate()', line: 4, explanation: '🎬 Browser ready to paint! RAF callback fires (typically after ~16ms for 60fps).' },
        { action: 'checkEventLoop', explanation: 'Event Loop executes the animation frame callback.' },
        { action: 'addToStack', item: 'console.log("Frame 0")', execute: true, line: 5, explanation: 'First frame renders. count is 0.' },
        { action: 'log', message: 'Frame 0', explanation: 'Output: Frame 0. First animation frame!' },
        { action: 'removeFromStack', explanation: 'Console.log done.' },
        { action: 'addToStack', item: 'requestAnimationFrame(animate)', execute: false, line: 7, explanation: 'Scheduling the next frame. count is now 1.' },
        { action: 'addToWebAPI', item: 'RAF: animate (Frame 1)', callback: 'animate()', explanation: 'Second frame scheduled.' },
        { action: 'removeFromStack', explanation: 'RAF scheduled.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'animate()', line: 4, explanation: '🎬 ~16ms later, next frame ready!' },
        { action: 'checkEventLoop', explanation: 'Second frame callback executes.' },
        { action: 'addToStack', item: 'console.log("Frame 1")', execute: true, line: 5, explanation: 'Second frame renders. count is 1.' },
        { action: 'log', message: 'Frame 1', explanation: 'Output: Frame 1' },
        { action: 'removeFromStack', explanation: 'Frame 1 done.' },
        { action: 'addToStack', item: 'requestAnimationFrame(animate)', execute: false, line: 7, explanation: 'Scheduling third and final frame. count is now 2.' },
        { action: 'addToWebAPI', item: 'RAF: animate (Frame 2)', callback: 'animate()', explanation: 'Final frame scheduled.' },
        { action: 'removeFromStack', explanation: 'RAF scheduled.' },
        { action: 'moveToTaskQueue', from: 'webAPI', callback: 'animate()', line: 4, explanation: '🎬 Third frame ready!' },
        { action: 'checkEventLoop', explanation: 'Final frame callback executes.' },
        { action: 'addToStack', item: 'console.log("Frame 2")', execute: true, line: 5, explanation: 'Final frame renders. count is 2.' },
        { action: 'log', message: 'Frame 2', explanation: 'Output: Frame 2' },
        { action: 'removeFromStack', explanation: 'Last frame complete.' },
        { action: 'removeFromStack', explanation: 'Animation complete! RAF is ideal for smooth 60fps animations.' }
      ]
    }
  };

  // Combine static examples with dynamic custom example
  const allExamples: Record<ExampleKey, Example> = {
    ...examples,
    custom: customExample
  };

  const executeStep = (step: Step) => {
    if (step.line !== undefined) {
      setHighlightedLine(step.line);
    }
    
    if (step.explanation) {
      setCurrentExplanation(step.explanation);
    }
    
    switch (step.action) {
      case 'addToStack':
        setCallStack(prev => [...prev, step.item!]);
        break;
      case 'removeFromStack':
        setCallStack(prev => prev.slice(0, -1));
        break;
      case 'addToWebAPI':
        setWebAPIs(prev => [...prev, { label: step.item!, callback: step.callback! }]);
        break;
      case 'moveToTaskQueue':
        setWebAPIs(prev => prev.slice(1));
        setTaskQueue(prev => [...prev, step.callback!]);
        break;
      case 'addToMicroTask':
        setMicroTaskQueue(prev => [...prev, step.item!]);
        break;
      case 'processMicroTasks':
        if (microTaskQueue.length > 0) {
          setMicroTaskQueue(prev => prev.slice(1));
        }
        break;
      case 'checkEventLoop':
        if (taskQueue.length > 0) {
          setTaskQueue(prev => prev.slice(1));
        }
        setEventLoopCycles(prev => prev + 1);
        break;
      case 'log':
        setLogs(prev => [...prev, step.message!]);
        break;
    }
  };

  useEffect(() => {
    if (isRunning && currentStep < allExamples[selectedExample].steps.length) {
      animationRef.current = setTimeout(() => {
        if (startTimeRef.current) {
          setElapsedTime(Date.now() - startTimeRef.current);
        }
        executeStep(allExamples[selectedExample].steps[currentStep]);
        setCurrentStep(prev => prev + 1);
      }, speed);
    } else if (currentStep >= allExamples[selectedExample].steps.length) {
      setIsRunning(false);
      setHighlightedLine(null);
    }
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isRunning, currentStep, speed, selectedExample, allExamples, microTaskQueue.length, taskQueue.length]);

  const reset = () => {
    setIsRunning(false);
    setCallStack([]);
    setTaskQueue([]);
    setMicroTaskQueue([]);
    setWebAPIs([]);
    setLogs([]);
    setCurrentStep(0);
    setHighlightedLine(null);
    setCurrentExplanation('Click "Start" or "Next" to begin stepping through the code execution.');
    setElapsedTime(0);
    setEventLoopCycles(0);
    startTimeRef.current = null;
  };

  const togglePlay = () => {
    if (currentStep >= allExamples[selectedExample].steps.length) {
      reset();
    }
    if (!isRunning && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    setIsRunning(!isRunning);
  };

  const nextStep = () => {
    if (currentStep < allExamples[selectedExample].steps.length) {
      setIsRunning(false);
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      setElapsedTime(Date.now() - startTimeRef.current);
      executeStep(allExamples[selectedExample].steps[currentStep]);
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setIsRunning(false);
      reset();
      for (let i = 0; i < currentStep - 1; i++) {
        executeStep(allExamples[selectedExample].steps[i]);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepNumber: number) => {
    setIsRunning(false);
    reset();
    for (let i = 0; i < stepNumber; i++) {
      executeStep(allExamples[selectedExample].steps[i]);
    }
    setCurrentStep(stepNumber);
  };

  // Share functionality - copy URL with state to clipboard
  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('example', selectedExample);
    url.searchParams.set('step', currentStep.toString());
    
    try {
      await navigator.clipboard.writeText(url.toString());
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2500);
      
      // Track share event
      if (typeof window !== 'undefined' && (window as any).trackEvent) {
        (window as any).trackEvent('share', { method: 'clipboard', example: selectedExample, step: currentStep });
      }
    } catch (err) {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = url.toString();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2500);
    }
  }, [selectedExample, currentStep]);

  // Export as image functionality
  const handleExport = useCallback(async () => {
    if (!visualizerRef.current || isExporting) return;
    
    setIsExporting(true);
    try {
      const canvas = await html2canvas(visualizerRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      
      const link = document.createElement('a');
      link.download = `event-loop-${selectedExample}-step${currentStep}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      // Track export event
      if (typeof window !== 'undefined' && (window as any).trackEvent) {
        (window as any).trackEvent('export_image', { example: selectedExample, step: currentStep });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedExample, currentStep, isExporting]);

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exampleParam = params.get('example');
    const stepParam = params.get('step');
    
    if (exampleParam && exampleParam in examples) {
      setSelectedExample(exampleParam as ExampleKey);
      if (stepParam) {
        const stepNum = parseInt(stepParam, 10);
        if (!isNaN(stepNum)) {
          setTimeout(() => goToStep(Math.min(stepNum, examples[exampleParam as StaticExampleKey].steps.length)), 100);
        }
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in textarea or input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextStep();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevStep();
          break;
        case 'ArrowUp':
          e.preventDefault();
          // Increase speed (lower ms = faster)
          setSpeed(prev => Math.max(200, prev - 200));
          break;
        case 'ArrowDown':
          e.preventDefault();
          // Decrease speed (higher ms = slower)
          setSpeed(prev => Math.min(2000, prev + 200));
          break;
        case 'KeyR':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            reset();
          }
          break;
        case 'Home':
          e.preventDefault();
          goToStep(0);
          break;
        case 'End':
          e.preventDefault();
          goToStep(allExamples[selectedExample].steps.length);
          break;
        case 'Slash':
        case 'Digit191': // ? key
          if (e.shiftKey) {
            e.preventDefault();
            setShowHelpModal(prev => !prev);
          }
          break;
        case 'Escape':
          setShowHelpModal(false);
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const exampleKeys = Object.keys(allExamples).filter(k => k !== 'custom' || allExamples.custom.steps.length > 0);
            const index = parseInt(e.code.replace('Digit', '')) - 1;
            if (index < exampleKeys.length) {
              setSelectedExample(exampleKeys[index] as ExampleKey);
              reset();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, currentStep, selectedExample, allExamples]);

  const parseCustomCode = (code: string): Example | null => {
    setCodeError('');
    const steps: Step[] = [];
    const lines = code.trim().split('\n');
    
    // Join the code to detect multi-line patterns like fetch chains
    const fullCode = code.trim();
    
    // Helper to extract console.log message (handles multiple formats)
    const extractLogMessage = (line: string): string => {
      // Match: console.log("message") or console.log('message')
      const simpleMatch = line.match(/console\.log\(\s*['"]([^'"]+)['"]\s*\)/);
      if (simpleMatch) return simpleMatch[1];
      
      // Match: console.log("message", variable) - extract the string part
      const mixedMatch = line.match(/console\.log\(\s*['"]([^'"]+)['"]/);
      if (mixedMatch) return mixedMatch[1] + ' [data]';
      
      // Match: console.error("message", variable)
      const errorMatch = line.match(/console\.error\(\s*['"]([^'"]+)['"]/);
      if (errorMatch) return 'Error: ' + errorMatch[1];
      
      return 'output';
    };

    // Check if code contains fetch pattern
    const hasFetch = fullCode.includes('fetch(');
    
    if (hasFetch) {
      // Parse fetch-based code
      const urlMatch = fullCode.match(/fetch\(\s*['"]([^'"]+)['"]\s*\)/);
      const url = urlMatch ? urlMatch[1] : 'API endpoint';
      
      // Find all .then callbacks
      const thenCallbacks: string[] = [];
      const thenMatches = fullCode.matchAll(/\.then\s*\(\s*(?:\w+\s*=>\s*)?([^)]+)\)/g);
      for (const match of thenMatches) {
        thenCallbacks.push(match[1].trim());
      }
      
      // Find synchronous console.log statements (not inside callbacks)
      const syncLogs: {line: number, message: string}[] = [];
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('console.log') && !trimmed.includes('.then') && !trimmed.includes('=>')) {
          syncLogs.push({ line: index + 1, message: extractLogMessage(trimmed) });
        }
      });
      
      // Step 1: Add fetch to call stack
      steps.push({
        action: 'addToStack',
        item: `fetch("${url.substring(0, 30)}${url.length > 30 ? '...' : ''}")`,
        execute: false,
        line: 1,
        explanation: `Initiating fetch request to ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}`
      });
      
      // Step 2: Move to Web APIs
      steps.push({
        action: 'addToWebAPI',
        item: 'fetch() → Pending...',
        callback: '.then() callbacks',
        explanation: 'Fetch request is handled by Web APIs (browser makes HTTP request)'
      });
      
      // Step 3: Remove from stack
      steps.push({
        action: 'removeFromStack',
        explanation: 'fetch() returns immediately with a Promise, continues to next line'
      });
      
      // Step 4: Execute synchronous code
      syncLogs.forEach((log) => {
        steps.push({
          action: 'addToStack',
          item: `console.log("${log.message}")`,
          execute: true,
          line: log.line,
          explanation: 'Synchronous code executes immediately while fetch is pending'
        });
        steps.push({
          action: 'log',
          message: log.message,
          explanation: `Output: ${log.message}`
        });
        steps.push({
          action: 'removeFromStack',
          explanation: 'console.log complete'
        });
      });
      
      // Step 5: Fetch completes, response.json() callback queued
      steps.push({
        action: 'moveToTaskQueue',
        from: 'webAPI',
        callback: 'response => response.json()',
        explanation: 'Fetch completed! First .then() callback added to Microtask Queue'
      });
      
      steps.push({
        action: 'addToMicroTask',
        item: 'response.json()',
        explanation: 'response.json() returns another Promise (also async!)'
      });
      
      // Step 6: Event loop check
      steps.push({
        action: 'checkEventLoop',
        explanation: 'Call Stack empty → Event Loop processes Microtask Queue'
      });
      
      // Step 7: Process first .then
      steps.push({
        action: 'processMicroTasks',
        explanation: 'Processing microtasks (Promises have high priority!)'
      });
      
      steps.push({
        action: 'addToStack',
        item: 'response.json()',
        execute: true,
        line: 2,
        explanation: 'Parsing JSON response'
      });
      
      steps.push({
        action: 'removeFromStack',
        explanation: 'JSON parsing complete, queues next .then()'
      });
      
      // Step 8: Second .then callback
      steps.push({
        action: 'addToMicroTask',
        item: 'data => console.log(...)',
        explanation: 'Next .then() callback added to Microtask Queue'
      });
      
      steps.push({
        action: 'processMicroTasks',
        explanation: 'Processing next microtask'
      });
      
      steps.push({
        action: 'addToStack',
        item: 'console.log("Data received:", data)',
        execute: true,
        line: 3,
        explanation: 'Executing callback with the fetched data'
      });
      
      steps.push({
        action: 'log',
        message: 'Data received: { userId: 1, id: 1, title: "...", completed: false }',
        explanation: 'Data from API is now available!'
      });
      
      steps.push({
        action: 'removeFromStack',
        explanation: 'All callbacks complete!'
      });
      
    } else {
      // Original line-by-line parsing for non-fetch code
      const pendingTasks: { line: number; delay: number; callback: string; messages: string[] }[] = [];
      const pendingMicrotasks: { line: number; callback: string; messages: string[] }[] = [];
      let activeCallback: { kind: 'task' | 'microtask'; line: number; delay: number; messages: string[]; callback: string } | null = null;
      let callbackDepth = 0;

      const countChar = (value: string, char: string) =>
        (value.match(new RegExp(`\\${char}`, 'g')) || []).length;

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        const lineNum = index + 1;

        if (activeCallback) {
          if (trimmedLine.includes('console.log') || trimmedLine.includes('console.error')) {
            activeCallback.messages.push(extractLogMessage(trimmedLine));
          }

          callbackDepth += countChar(trimmedLine, '{');
          callbackDepth -= countChar(trimmedLine, '}');

          if (callbackDepth <= 0) {
            if (activeCallback.kind === 'task') {
              pendingTasks.push({
                line: activeCallback.line,
                delay: activeCallback.delay,
                callback: activeCallback.callback,
                messages: activeCallback.messages
              });
            } else {
              pendingMicrotasks.push({
                line: activeCallback.line,
                callback: activeCallback.callback,
                messages: activeCallback.messages
              });
            }
            activeCallback = null;
            callbackDepth = 0;
          }
          return;
        }

        if (!trimmedLine || trimmedLine.startsWith('//')) return;

        if (trimmedLine.includes('console.log') || trimmedLine.includes('console.error')) {
          const message = extractLogMessage(trimmedLine);
          steps.push({ 
            action: 'addToStack', 
            item: trimmedLine.substring(0, 50) + (trimmedLine.length > 50 ? '...' : ''), 
            execute: true, 
            line: lineNum,
            explanation: `Executing: ${trimmedLine}`
          });
          steps.push({ 
            action: 'log', 
            message,
            explanation: `Output: ${message}`
          });
          steps.push({ 
            action: 'removeFromStack',
            explanation: 'Removed from call stack'
          });
        }
        else if (trimmedLine.includes('setTimeout')) {
          const delayMatch = trimmedLine.match(/setTimeout\(.+,\s*(\d+)\)/);
          const delay = delayMatch ? parseInt(delayMatch[1], 10) : 0;
          const callbackMatch = trimmedLine.match(/console\.log\(['"](.+)['"]\)/);
          const callback = callbackMatch ? `console.log("${callbackMatch[1]}")` : 'setTimeout callback';
          
          steps.push({ 
            action: 'addToStack', 
            item: `setTimeout(cb, ${delay})`, 
            execute: false, 
            line: lineNum,
            explanation: `Registering setTimeout with ${delay}ms delay`
          });
          steps.push({ 
            action: 'addToWebAPI', 
            item: `Timer: ${delay}ms`, 
            callback,
            explanation: `Timer started in Web APIs`
          });
          steps.push({ 
            action: 'removeFromStack',
            explanation: 'setTimeout registration complete'
          });

          const hasBlock = trimmedLine.includes('{');
          if (hasBlock) {
            activeCallback = {
              kind: 'task',
              line: lineNum,
              delay,
              callback,
              messages: []
            };
            if (callbackMatch) {
              activeCallback.messages.push(callbackMatch[1]);
            }
            callbackDepth = countChar(trimmedLine, '{') - countChar(trimmedLine, '}');
            if (callbackDepth <= 0) {
              pendingTasks.push({
                line: activeCallback.line,
                delay: activeCallback.delay,
                callback: activeCallback.callback,
                messages: activeCallback.messages
              });
              activeCallback = null;
              callbackDepth = 0;
            }
          } else {
            pendingTasks.push({
              line: lineNum,
              delay,
              callback,
              messages: callbackMatch ? [callbackMatch[1]] : []
            });
          }
        }
        else if (trimmedLine.includes('Promise.resolve()') && trimmedLine.includes('.then')) {
          const callbackMatch = trimmedLine.match(/console\.log\(['"](.+)['"]\)/);
          const callback = callbackMatch ? `console.log("${callbackMatch[1]}")` : 'promise callback';
          
          steps.push({ 
            action: 'addToStack', 
            item: 'Promise.resolve()', 
            execute: false, 
            line: lineNum,
            explanation: 'Creating resolved Promise'
          });
          steps.push({ 
            action: 'addToMicroTask', 
            item: callback,
            explanation: 'Promise callback added to Microtask Queue (high priority!)'
          });
          steps.push({ 
            action: 'removeFromStack',
            explanation: 'Promise setup complete'
          });

          const hasBlock = trimmedLine.includes('{');
          if (hasBlock) {
            activeCallback = {
              kind: 'microtask',
              line: lineNum,
              delay: 0,
              callback,
              messages: []
            };
            if (callbackMatch) {
              activeCallback.messages.push(callbackMatch[1]);
            }
            callbackDepth = countChar(trimmedLine, '{') - countChar(trimmedLine, '}');
            if (callbackDepth <= 0) {
              pendingMicrotasks.push({
                line: activeCallback.line,
                callback: activeCallback.callback,
                messages: activeCallback.messages
              });
              activeCallback = null;
              callbackDepth = 0;
            }
          } else {
            pendingMicrotasks.push({
              line: lineNum,
              callback,
              messages: callbackMatch ? [callbackMatch[1]] : []
            });
          }
        }
      });

      if (pendingMicrotasks.length > 0) {
        steps.push({
          action: 'checkEventLoop',
          explanation: 'Call Stack empty → Event Loop processes Microtask Queue first'
        });
        steps.push({
          action: 'processMicroTasks',
          explanation: 'Processing microtasks (Promises have higher priority)'
        });
        pendingMicrotasks.forEach((task) => {
          if (task.messages.length === 0) {
            steps.push({
              action: 'addToStack',
              item: task.callback,
              execute: true,
              line: task.line,
              explanation: `Executing microtask: ${task.callback}`
            });
            steps.push({
              action: 'removeFromStack',
              explanation: 'Microtask complete'
            });
            return;
          }
          task.messages.forEach((message) => {
            steps.push({
              action: 'addToStack',
              item: `console.log("${message}")`,
              execute: true,
              line: task.line,
              explanation: `Executing microtask: console.log("${message}")`
            });
            steps.push({
              action: 'log',
              message,
              explanation: `Output: ${message}`
            });
            steps.push({
              action: 'removeFromStack',
              explanation: 'Microtask complete'
            });
          });
        });
      }

      if (pendingTasks.length > 0) {
        const orderedTasks = [...pendingTasks].sort((a, b) => a.delay - b.delay || a.line - b.line);
        orderedTasks.forEach((task) => {
          steps.push({
            action: 'moveToTaskQueue',
            from: 'webAPI',
            callback: task.callback,
            line: task.line,
            explanation: 'Timer completed, callback moved to Task Queue'
          });
          steps.push({
            action: 'checkEventLoop',
            explanation: 'Event Loop picks next task from Task Queue'
          });
          if (task.messages.length === 0) {
            steps.push({
              action: 'addToStack',
              item: task.callback,
              execute: true,
              line: task.line,
              explanation: `Executing callback: ${task.callback}`
            });
            steps.push({
              action: 'removeFromStack',
              explanation: 'Callback complete'
            });
            return;
          }
          task.messages.forEach((message) => {
            steps.push({
              action: 'addToStack',
              item: `console.log("${message}")`,
              execute: true,
              line: task.line,
              explanation: `Executing callback: console.log("${message}")`
            });
            steps.push({
              action: 'log',
              message,
              explanation: `Output: ${message}`
            });
            steps.push({
              action: 'removeFromStack',
              explanation: 'Callback complete'
            });
          });
        });
      }
    }

    if (steps.length === 0) {
      setCodeError('No valid JavaScript detected. Try adding console.log(), setTimeout(), fetch(), or Promise.resolve().then()');
      return null;
    }

    return {
      name: 'Custom Code',
      description: 'Your custom example',
      code: code,
      steps: steps
    };
  };

  const runCustomCode = () => {
    if (!customCode.trim()) {
      setCodeError('Please enter some code first!');
      return;
    }

    const parsed = parseCustomCode(customCode);
    if (parsed) {
      setCustomExample(parsed);
      setSelectedExample('custom');
      reset();
      setMode('preset');
    }
  };

  const renderCodeWithHighlight = (code: string) => {
    const lines = code.split('\n');
    return lines.map((line, index) => {
      const lineNumber = index + 1;
      const isHighlighted = highlightedLine === lineNumber;
      return (
        <div
          key={index}
          className={`flex transition-all duration-200 ${
            isHighlighted ? 'bg-blue-500/20 border-l-2 border-blue-400' : ''
          }`}
          role="listitem"
          aria-current={isHighlighted ? 'step' : undefined}
        >
          <span className={`inline-block w-6 text-right pr-2 select-none ${
            isHighlighted ? 'text-blue-400 font-bold' : 'text-slate-600'
          }`} aria-hidden="true">
            {lineNumber}
          </span>
          <span className={isHighlighted ? 'text-white font-semibold' : 'text-slate-300'}>
            {line || ' '}
          </span>
        </div>
      );
    });
  };

  // Help Modal Component
  const HelpModal = () => (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      onClick={() => setShowHelpModal(false)}
    >
      <div 
        className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-800 p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 id="help-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
            <HelpCircle className="text-blue-400" size={24} />
            How to Use
          </h2>
          <button
            onClick={() => setShowHelpModal(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Close help modal"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* What is Event Loop */}
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">🔄 What is the Event Loop?</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              The Event Loop is JavaScript's mechanism for handling asynchronous operations. 
              It continuously checks the Call Stack and queues, moving tasks from queues to the stack when it's empty.
            </p>
          </section>

          {/* Components */}
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">🎯 Components Explained</h3>
            <div className="grid gap-2 text-sm">
              <div className="bg-slate-700/50 rounded-lg p-3">
                <strong className="text-blue-400">Call Stack</strong>
                <p className="text-slate-300">Executes synchronous code, one function at a time (LIFO - Last In, First Out)</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <strong className="text-cyan-400">Web APIs</strong>
                <p className="text-slate-300">Browser-provided APIs (setTimeout, fetch, DOM events) that handle async operations</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <strong className="text-emerald-400">Microtask Queue</strong>
                <p className="text-slate-300">High-priority queue for Promises (.then, .catch, async/await). Processed before macrotasks</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <strong className="text-amber-400">Task Queue (Macrotasks)</strong>
                <p className="text-slate-300">Lower-priority queue for setTimeout, setInterval, I/O callbacks</p>
              </div>
            </div>
          </section>

          {/* Controls */}
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">🎮 Controls</h3>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Use <strong>Start/Pause</strong> to auto-play through steps</li>
              <li>• Use <strong>Prev/Next</strong> to manually step through</li>
              <li>• Use the <strong>slider</strong> to jump to any step</li>
              <li>• Adjust <strong>Speed</strong> to control animation pace</li>
              <li>• Switch to <strong>Custom</strong> mode to write your own code</li>
            </ul>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">⌨️ Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">Space</kbd>
                <span className="text-slate-300">Play/Pause</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">← →</kbd>
                <span className="text-slate-300">Step backward/forward</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">↑ ↓</kbd>
                <span className="text-slate-300">Increase/Decrease speed</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">R</kbd>
                <span className="text-slate-300">Reset visualization</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">Home/End</kbd>
                <span className="text-slate-300">Jump to start/end</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">1-9</kbd>
                <span className="text-slate-300">Select example</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">?</kbd>
                <span className="text-slate-300">Toggle this help</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-slate-700 px-2 py-1 rounded text-slate-200 font-mono">Esc</kbd>
                <span className="text-slate-300">Close modals</span>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">💡 Tips</h3>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Watch the <strong>"What's Happening?"</strong> box for step-by-step explanations</li>
              <li>• The highlighted code line shows what's currently executing</li>
              <li>• Notice how microtasks (Promises) always run before macrotasks (setTimeout)</li>
              <li>• Try the Custom mode to experiment with your own async code patterns</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  // Share Toast Component
  const ShareToast = () => (
    <div 
      className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in z-50"
      role="alert"
      aria-live="polite"
    >
      <CheckCircle size={20} />
      <span className="font-medium">Link copied to clipboard!</span>
    </div>
  );

  return (
    <div className="min-h-screen md:h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-2 overflow-auto md:overflow-hidden" role="main" aria-label="JavaScript Event Loop Visualizer">
      {/* Help Modal */}
      {showHelpModal && <HelpModal />}
      
      {/* Share Toast */}
      {showShareToast && <ShareToast />}
      
      <div className="max-w-[1800px] mx-auto h-full flex flex-col" ref={visualizerRef}>
        <div className="text-center mb-2">
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Zap className="text-blue-400" size={24} aria-hidden="true" />
            <span className="hidden sm:inline">JavaScript</span> Event Loop Visualizer
          </h1>
        </div>

        {/* Controls */}
        <div className="bg-slate-800/40 backdrop-blur-lg rounded-xl p-2 mb-2 border border-slate-700/50 shadow-xl" role="toolbar" aria-label="Visualization controls">
          {/* All controls in one row */}
          <div className="flex flex-wrap gap-2 items-center justify-between mb-2">
            {/* Mode Toggle + Play/Reset */}
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-xs font-medium touch-manipulation shadow-lg shadow-blue-500/25"
                aria-label={isRunning ? 'Pause animation' : currentStep === 0 ? 'Start animation' : 'Resume animation'}
              >
                {isRunning ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {isRunning ? 'Pause' : currentStep === 0 ? 'Start' : 'Resume'}
              </button>
              <button
                onClick={reset}
                className="bg-slate-700/60 hover:bg-slate-600 active:scale-95 text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-xs font-medium touch-manipulation border border-slate-600/50"
                aria-label="Reset visualization"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Reset
              </button>
              <div className="w-px h-6 bg-slate-600/50 mx-1" aria-hidden="true"></div>
              <button
                onClick={() => setMode('custom')}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all text-xs touch-manipulation ${
                  mode === 'custom' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 active:bg-slate-600'
                }`}
                aria-pressed={mode === 'custom'}
                aria-label="Switch to custom code mode"
              >
                <Edit3 size={14} aria-hidden="true" />
                Custom
              </button>
            </div>

            {/* Example Dropdown + Speed + Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Share, Export, Help Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleShare}
                  className="bg-slate-700/60 hover:bg-slate-600 active:scale-95 text-slate-200 p-1.5 rounded-lg transition-all touch-manipulation border border-slate-600/50"
                  aria-label="Share link to current state"
                  title="Share link"
                >
                  <Share2 size={16} aria-hidden="true" />
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-slate-700/60 hover:bg-slate-600 active:scale-95 disabled:opacity-50 text-slate-200 p-1.5 rounded-lg transition-all touch-manipulation border border-slate-600/50"
                  aria-label="Export as PNG image"
                  title="Export as image"
                >
                  <Download size={16} aria-hidden="true" className={isExporting ? 'animate-pulse' : ''} />
                </button>
                <button
                  onClick={() => setShowHelpModal(true)}
                  className="bg-slate-700/60 hover:bg-slate-600 active:scale-95 text-slate-200 p-1.5 rounded-lg transition-all touch-manipulation border border-slate-600/50"
                  aria-label="Open help and tutorial"
                  title="Help (press ?)"
                >
                  <HelpCircle size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="w-px h-6 bg-slate-600/50" aria-hidden="true"></div>

              <div className="flex items-center gap-1.5">
                <label className="text-slate-400 text-xs hidden sm:inline" id="example-label">Example:</label>
                <select
                  value={selectedExample}
                  onChange={(e) => {
                    setSelectedExample(e.target.value as ExampleKey);
                    reset();
                  }}
                  className="bg-slate-800/80 text-slate-200 px-2 py-1.5 rounded-lg border border-slate-600/50 focus:outline-none focus:border-blue-500 text-xs touch-manipulation"
                >
                  {Object.entries(allExamples).filter(([key]) => key !== 'custom' || allExamples.custom.steps.length > 0).map(([key, ex]) => (
                    <option key={key} value={key} className="bg-slate-800">
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-slate-400 text-xs hidden sm:inline">Speed:</label>
                <input
                  type="range"
                  min="200"
                  max="2000"
                  step="200"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-16 touch-manipulation"
                />
                <span className="text-slate-300 text-xs w-12">{speed}ms</span>
              </div>
            </div>
          </div>

          {mode === 'preset' ? (
            <div>

              {/* Performance Indicators */}
              <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-slate-600/30">
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <Timer size={14} className="text-slate-400" />
                  <span className="font-mono">{(elapsedTime / 1000).toFixed(1)}s</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <Activity size={14} className="text-slate-400" />
                  <span>Cycles: <span className="font-mono">{eventLoopCycles}</span></span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <BarChart3 size={14} className="text-slate-400" />
                  <span>Stack: <span className="font-mono">{callStack.length}</span></span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <span>Tasks: <span className="font-mono">{taskQueue.length}</span></span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <span>Micro: <span className="font-mono">{microTaskQueue.length}</span></span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-600/40 px-2 py-1 rounded text-sm text-slate-300">
                  <span>APIs: <span className="font-mono">{webAPIs.length}</span></span>
                </div>
              </div>

              {/* Step Navigation Controls */}
              <div className="border-t border-slate-600/30 pt-2">
                {/* What's Happening Explanation */}
                <div className="mb-2 bg-slate-800/50 border border-slate-600/40 rounded-lg p-2">
                  <h3 className="text-sm font-bold text-slate-200 mb-0.5 flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-blue-400" />
                    What's Happening?
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {currentExplanation}
                  </p>
                </div>

                <div className="flex items-center gap-2 justify-between flex-wrap">
                  {/* Step Counter */}
                  <div className="text-slate-200 text-sm font-semibold bg-slate-800/60 px-2 py-1 rounded-lg border border-slate-600/40">
                    Step {currentStep}/{allExamples[selectedExample].steps.length}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => goToStep(0)}
                      disabled={currentStep === 0}
                      className="bg-slate-700/60 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 p-1.5 rounded-lg transition-all touch-manipulation border border-slate-600/50"
                      title="Go to start"
                    >
                      <SkipBack size={16} />
                    </button>
                    <button
                      onClick={prevStep}
                      disabled={currentStep === 0}
                      className="bg-slate-700/60 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 px-2 py-1.5 rounded-lg flex items-center gap-1 transition-all text-sm touch-manipulation border border-slate-600/50"
                      title="Previous step"
                    >
                      <ChevronLeft size={16} />
                      Prev
                    </button>
                    <button
                      onClick={nextStep}
                      disabled={currentStep >= allExamples[selectedExample].steps.length}
                      className="bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-sm font-medium touch-manipulation shadow-lg shadow-blue-500/25"
                      title="Next step"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => goToStep(allExamples[selectedExample].steps.length)}
                      disabled={currentStep >= allExamples[selectedExample].steps.length}
                      className="bg-slate-700/60 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 p-1.5 rounded-lg transition-all touch-manipulation border border-slate-600/50"
                      title="Go to end"
                    >
                      <SkipForward size={16} />
                    </button>
                  </div>

                  {/* Progress Slider */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-[80px] sm:min-w-[120px]">
                    <label className="text-slate-400 text-sm whitespace-nowrap hidden sm:inline">Jump:</label>
                    <input
                      type="range"
                      min="0"
                      max={allExamples[selectedExample].steps.length}
                      value={currentStep}
                      onChange={(e) => goToStep(Number(e.target.value))}
                      className="flex-1 touch-manipulation"
                      title={`Step ${currentStep}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-slate-200 text-xs font-semibold mb-1">
                  Write Your JavaScript Code:
                </label>
                <textarea
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  placeholder={`// Try writing your own code!
console.log("Start");
setTimeout(() => console.log("Timeout"), 0);
Promise.resolve().then(() => console.log("Promise"));
console.log("End");`}
                  className="w-full h-32 bg-slate-900 text-slate-200 font-mono text-xs p-2 rounded-lg border border-slate-600/50 focus:outline-none focus:border-blue-500 resize-none touch-manipulation placeholder:text-slate-500"
                />
                {codeError && (
                  <p className="text-red-400 text-xs mt-1">⚠️ {codeError}</p>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={runCustomCode}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-xs font-semibold shadow-lg shadow-blue-500/25"
                >
                  <Play size={14} />
                  Visualize
                </button>
                <button
                  onClick={() => {
                    setCustomCode('');
                    setCodeError('');
                  }}
                  className="bg-slate-700/60 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-xs border border-slate-600/50"
                >
                  <RotateCcw size={14} />
                  Clear
                </button>
              </div>

              <div className="bg-slate-800/50 border border-slate-600/40 rounded-lg p-2">
                <h4 className="text-slate-300 font-semibold mb-0.5 text-xs">💡 Supported:</h4>
                <div className="text-slate-400 text-[10px] space-y-0.5">
                  <div><code className="bg-slate-900/80 px-1 rounded text-slate-300">console.log("msg")</code> • <code className="bg-slate-900/80 px-1 rounded text-slate-300">setTimeout(cb, ms)</code> • <code className="bg-slate-900/80 px-1 rounded text-slate-300">Promise.resolve().then(cb)</code></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Layout: Code on Left, Visualization on Right */}
        {mode === 'preset' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0 overflow-auto lg:overflow-hidden">
          {/* LEFT PANEL: Code Editor */}
          <div className="flex flex-col min-h-[200px] lg:min-h-0">
            <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 border border-slate-700/50 shadow-xl flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Code className="text-blue-400" size={16} />
                  {allExamples[selectedExample].name}
                </h2>
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full hidden sm:inline">
                  {allExamples[selectedExample].description}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg overflow-auto flex-1 min-h-0 touch-pan-y border border-slate-700/50">
                <pre className="text-xs sm:text-sm font-mono">
                  <code>
                    {renderCodeWithHighlight(allExamples[selectedExample].code)}
                  </code>
                </pre>
              </div>
              
              {/* Console Output - Inside Left Panel */}
              <div className="mt-1.5 bg-slate-950 p-2 rounded-lg border border-slate-700/50">
                <h3 className="text-xs font-bold text-slate-200 mb-1 flex items-center gap-1">
                  <Code className="text-green-400" size={12} />
                  Console
                </h3>
                <div className="font-mono text-sm space-y-0.5 max-h-[80px] overflow-y-auto touch-pan-y">
                  {logs.length === 0 ? (
                    <div className="text-slate-600">// Output here...</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="text-green-400">
                        &gt; {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Event Loop Visualization */}
          <div className="flex flex-col gap-2 min-h-[200px] lg:min-h-0 overflow-auto touch-pan-y" role="region" aria-label="Event Loop Visualization">
            {/* Mobile: 2x2 grid for all queues, Desktop: stacked */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {/* Call Stack */}
              <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 border border-blue-500/40" role="region" aria-label="Call Stack">
                <h2 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Database className="text-blue-400" size={14} aria-hidden="true" />
                  Call Stack
                  <span className="sr-only">({callStack.length} items)</span>
                </h2>
                <div className="space-y-1 min-h-[40px] sm:min-h-[50px]" role="list" aria-live="polite">
                  {callStack.length === 0 ? (
                    <div className="text-slate-500 text-center py-1 text-sm" role="listitem">Empty</div>
                  ) : (
                    callStack.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-blue-600/40 border border-blue-500/60 text-white px-2 py-1 rounded font-mono text-xs animate-pulse truncate shadow-sm shadow-blue-500/20"
                        role="listitem"
                      >
                        {item}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Web APIs */}
              <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 border border-cyan-500/40" role="region" aria-label="Web APIs">
                <h2 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Clock className="text-cyan-400" size={14} aria-hidden="true" />
                  Web APIs
                  <span className="sr-only">({webAPIs.length} items)</span>
                </h2>
                <div className="space-y-1 min-h-[40px] sm:min-h-[50px]" role="list" aria-live="polite">
                  {webAPIs.length === 0 ? (
                    <div className="text-slate-500 text-center py-1 text-sm" role="listitem">No pending</div>
                  ) : (
                    webAPIs.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-cyan-600/40 border border-cyan-500/60 text-white px-2 py-1 rounded shadow-sm shadow-cyan-500/20"
                        role="listitem"
                      >
                        <div className="font-mono text-xs truncate">{item.label}</div>
                        <div className="text-[10px] text-slate-300 truncate">→ {item.callback}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Microtask Queue */}
              <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 border border-emerald-500/40" role="region" aria-label="Microtask Queue">
                <h2 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Zap className="text-emerald-400" size={14} aria-hidden="true" />
                  Microtasks
                  <span className="sr-only">({microTaskQueue.length} items)</span>
                </h2>
                <div className="space-y-1 min-h-[35px] sm:min-h-[45px]" role="list" aria-live="polite">
                  {microTaskQueue.length === 0 ? (
                    <div className="text-slate-500 text-center py-1 text-sm" role="listitem">Empty</div>
                  ) : (
                    microTaskQueue.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-emerald-600/40 border border-emerald-500/60 text-white px-2 py-1 rounded font-mono text-xs truncate shadow-sm shadow-emerald-500/20"
                        role="listitem"
                      >
                        {item}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Task Queue */}
              <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 border border-amber-500/40" role="region" aria-label="Task Queue">
                <h2 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Code className="text-amber-400" size={14} aria-hidden="true" />
                  Tasks
                  <span className="sr-only">({taskQueue.length} items)</span>
                </h2>
                <div className="space-y-1 min-h-[35px] sm:min-h-[45px]" role="list" aria-live="polite">
                  {taskQueue.length === 0 ? (
                    <div className="text-slate-500 text-center py-1 text-sm" role="listitem">Empty</div>
                  ) : (
                    taskQueue.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-amber-600/40 border border-amber-500/60 text-white px-2 py-1 rounded font-mono text-xs truncate shadow-sm shadow-amber-500/20"
                        role="listitem"
                      >
                        {item}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Legend - Hidden on small screens */}
        {mode === 'preset' && (
        <div className="bg-slate-800/40 backdrop-blur rounded-xl p-2 mt-2 border border-slate-700/50 hidden sm:block" role="contentinfo" aria-label="Legend and keyboard shortcuts">
          <div className="flex flex-wrap gap-4 text-sm text-slate-400 items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
              <span className="font-bold text-slate-300">Legend:</span>
              <span><strong className="text-blue-400">Stack:</strong> Sync</span>
              <span><strong className="text-cyan-400">APIs:</strong> Async</span>
              <span><strong className="text-emerald-400">Micro:</strong> Promises</span>
              <span><strong className="text-amber-400">Tasks:</strong> setTimeout</span>
            </div>
            <div className="flex flex-wrap gap-3 items-center text-xs text-slate-500">
              <span className="font-semibold text-slate-400">⌨️ Shortcuts:</span>
              <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">Space</kbd> Play/Pause</span>
              <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">←</kbd><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 ml-0.5">→</kbd> Step</span>
              <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">R</kbd> Reset</span>
              <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">↑</kbd><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 ml-0.5">↓</kbd> Speed</span>
              <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">?</kbd> Help</span>
            </div>
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="text-center py-2 mt-auto">
          <p className="text-slate-500 text-sm">
            Made with ❤️ by{' '}
            <a 
              href="https://sachinkasana-dev.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors font-medium hover:underline"
            >
              Sachin Kasana
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventLoopVisualizer;
