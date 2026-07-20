/**
 * Next's startup hook. Runs once per server process, before the app serves anything. It
 * starts the in-process scheduler, which is what makes invoice reminders fire without an
 * external cron.
 *
 * The shape of this file is deliberate. Next compiles instrumentation for EVERY runtime,
 * edge included, and the scheduler reaches nodemailer, which needs Node's `stream`. Edge has
 * no `stream`, so if the edge build follows that import the compile fails and every page in
 * the app returns 500.
 *
 * Guarding with an early `return` is not enough: webpack eliminates dead code inside a
 * branch, not statements that merely follow an early exit, so it still walked into the
 * import. Putting the import inside the `if` lets `process.env.NEXT_RUNTIME` be substituted
 * at build time, the branch drop out for edge, and the Node-only module never be reached.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    registerNode();
  }
}
