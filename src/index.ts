import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Cell } from '@jupyterlab/cells';


/**
 * Initialization data for the celler extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'celler:plugin',
  description: 'A JupyterLab extension which shows cell execution time',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
  console.log('⏱️ Celler extension is live.');

  tracker.widgetAdded.connect((_, panel) => {
    panel.sessionContext.ready.then(() => {
      const session = panel.sessionContext.session;
      const notebook = panel.content;

      if (!session) return;

      // Map msg_id -> { cell, stopTimer }
      const runningExecutions = new Map<string, { cell: Cell; stop: () => void }>();

      session.kernel?.anyMessage.connect((_, args) => {
        const msg = args.msg;
        const msgType = msg.header.msg_type;

        if (msgType === 'execute_request') {
          const cell = notebook.activeCell;
          if (cell) {
            // Clear existing timer if any for this cell
            for (const [id, exec] of runningExecutions.entries()) {
              if (exec.cell === cell) {
                exec.stop();
                runningExecutions.delete(id);
              }
            }

            // Start new timer
            const stop = attachTimer(cell);
            runningExecutions.set(msg.header.msg_id, { cell, stop });
          }
        }

        if (
          (msgType === 'execute_reply' || msgType === 'status') &&
          msg.parent_header &&
          runningExecutions.has(msg.parent_header.msg_id)
        ) {
          if (
            msgType === 'execute_reply' ||
            (msgType === 'status' &&
             'execution_state' in msg.content &&
             msg.content.execution_state === 'idle')
          ) {
            const exec = runningExecutions.get(msg.parent_header.msg_id)!;
            exec.stop();
            runningExecutions.delete(msg.parent_header.msg_id);
          }
        }
      });
    });
  });
}

};


function attachTimer(cell: Cell): (stop?: boolean) => void {
  const existing = cell.node.querySelector('.live-timer');
  if (existing) existing.remove();

  const timerElem = document.createElement('div');
  timerElem.className = 'live-timer';
  timerElem.style.color = '#106102';
  timerElem.style.fontSize = '12px';
  timerElem.style.marginTop = '3px';
  timerElem.textContent = '⏱ Took: 0.000 sec';

  cell.node.appendChild(timerElem);

  const start = performance.now();
  const interval = setInterval(() => {
    const elapsed = performance.now() - start;

    const ms = Math.floor(elapsed % 1000);
    const totalSeconds = Math.floor(elapsed / 1000);
    const s = totalSeconds % 60;
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);

    const format = (n: number, digits = 2) => n.toString().padStart(digits, '0');

    let display = '';
    if (h > 0) {
      display = `${format(h)} hr ${format(m)} min ${format(s)}.${format(ms, 3)} sec`;
    } else if (m > 0) {
      display = `${format(m)} min ${format(s)}.${format(ms, 3)} sec`;
    } else {
      display = `${s}.${format(ms, 3)} sec`;
    }

    timerElem.textContent = `⏱ Took: ${display}`;
  }, 100);

  return () => clearInterval(interval);
}




export default plugin;
