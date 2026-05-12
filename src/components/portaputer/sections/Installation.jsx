import Style from '../PortaputerPage.module.scss';

const parts = [
  {
    num: '1',
    title: 'Make a copy of your old computer',
    steps: [
      <>On the computer you want to bring along, open <strong>Downloads</strong> and run <strong>PortaPuterCapture-Setup</strong>.</>,
      <>Click through the setup &mdash; nothing to change.</>,
      <>PortaPuter Capture opens with your computer&apos;s name pre-filled. Press <strong>Enter</strong> to accept it.</>,
      <>Pick where to save the copy (<strong>Desktop</strong> is fine), then click <strong>Start</strong>.</>,
      <>Your BitLocker recovery key appears on screen. A copy is also saved to your desktop as <code>PortaPuter-BitLocker-Recovery.txt</code> &mdash; keep that file.</>,
      <>The capture runs on its own. Anywhere from 30 minutes to several hours, depending on how full your computer is.</>,
      <>When it finishes, a folder named <strong>PortaPuter-<em>YourComputerName</em></strong> sits on your desktop.</>,
    ],
  },
  {
    num: '2',
    title: 'Install the portable copy',
    steps: [
      <>Open the <strong>PortaPuter-<em>YourComputerName</em></strong> folder. (If you want to use it on a different computer, copy the folder over with a USB stick first.)</>,
      <>Run <strong>Install</strong> inside it.</>,
      <>Wait a few minutes. A <strong>Run PortaPuter VM</strong> shortcut appears on the desktop.</>,
    ],
  },
  {
    num: '3',
    title: 'Open your old desktop',
    steps: [
      <>Double-click <strong>Run PortaPuter VM</strong>.</>,
      <>A black window opens with scrolling text &mdash; that&apos;s the boot. After 30 seconds to 2 minutes, your old desktop appears inside.</>,
      <>Click inside to start using it. Shut it down the normal way when you&apos;re done.</>,
    ],
    tip: "If the window stays black for more than five minutes, close it and ask whoever sent you for help.",
  },
];

export default function Installation() {
  return (
    <section className={Style.section}>
      <header className={Style.pageHeader}>
        <h1 className={Style.pageTitle}>Installation and Use</h1>
      </header>

      <div className={Style.downloadCard}>
        <div className={Style.downloadCardLeft}>
          <h2 className={Style.downloadCardTitle}>Get the program</h2>
          <p className={Style.downloadCardDesc}>
            Save the file somewhere easy to find &mdash; your{' '}
            <strong>Downloads</strong> folder is fine.
          </p>
        </div>
        <a
          href="/api/portaputer/download"
          className={Style.downloadCardBtn}
          rel="nofollow noopener"
        >
          <i className="fa-solid fa-download" />
          Download PortaPuter
        </a>
      </div>

      <ol className={Style.phases}>
        {parts.map((part) => (
          <li key={part.num} className={Style.phase}>
            <div className={Style.phaseHeader}>
              <span className={Style.phaseNum}>Part {part.num}</span>
              <h2 className={Style.phaseTitle}>{part.title}</h2>
            </div>
            <ol className={Style.subSteps}>
              {part.steps.map((s, i) => (
                <li key={i} className={Style.subStep}>
                  <span className={Style.subStepNum}>{i + 1}</span>
                  <span className={Style.subStepBody}>{s}</span>
                </li>
              ))}
            </ol>
            {part.tip && (
              <div className={Style.tip}>
                <i className="fa-solid fa-lightbulb" />
                <span>{part.tip}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
