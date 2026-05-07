import Style from './PortaputerPage.module.scss';

const features = [
  {
    icon: 'fa-solid fa-bolt',
    title: 'Zero-downtime capture',
    desc: 'VSS snapshots image your running system without interruption. No reboots, no downtime.',
  },
  {
    icon: 'fa-solid fa-shield-halved',
    title: 'BitLocker aware',
    desc: 'Backs up your recovery key, suspends encryption for capture, then re-enables it automatically.',
  },
  {
    icon: 'fa-solid fa-file-zipper',
    title: 'Single file output',
    desc: 'Your OS, apps, files, and the entire VM runtime — compressed into one self-extracting executable.',
  },
  {
    icon: 'fa-solid fa-microchip',
    title: 'No hypervisor needed',
    desc: 'Ships with QEMU built in. Uses hardware acceleration when available, falls back gracefully.',
  },
  {
    icon: 'fa-solid fa-server',
    title: 'UEFI + Legacy BIOS',
    desc: 'Automatically detects firmware type and boots correctly on both UEFI and legacy BIOS systems.',
  },
  {
    icon: 'fa-solid fa-terminal',
    title: 'Fully scriptable',
    desc: 'Silent mode flags for unattended deployment. Fine-tune RAM, CPUs, and acceleration via vm.conf.',
  },
];

const steps = [
  {
    num: '1',
    title: 'Capture',
    desc: 'Run the installer on your Windows PC. PortaPuter safely images your live system using VSS snapshots — no downtime, no reboots.',
  },
  {
    num: '2',
    title: 'Package',
    desc: 'Your OS, apps, files, and a lightweight VM runtime are compressed into a single self-extracting executable on your desktop.',
  },
  {
    num: '3',
    title: 'Launch',
    desc: 'Double-click the file on any Windows PC. Your full desktop opens in a window, exactly as you left it.',
  },
];

export default function PortaputerPage() {
  return (
    <main className={Style.main}>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className={Style.hero}>
        <div className={Style.heroInner}>
          <h1 className={Style.title}>PortaPuter</h1>
          <p className={Style.tagline}>Your entire PC, in a single file.</p>
          <p className={Style.subtitle}>
            Capture a live Windows desktop into one portable executable.
            Double-click to launch it anywhere — no installation, no
            hypervisor, no fuss.
          </p>

          <div className={Style.cta}>
            <a
              href="https://github.com/aaronrohrbacher/portaputer/releases/latest"
              className={Style.downloadBtn}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fa-brands fa-windows" />
              Download for Windows
            </a>
            <span className={Style.versionNote}>v1.0 &middot; Free &amp; open source</span>
          </div>

          <div className={Style.platforms}>
            <span className={Style.available}>
              <i className="fa-brands fa-windows" /> Windows 10 / 11
            </span>
            <span className={Style.coming}>
              <i className="fa-brands fa-linux" /> Linux &mdash; coming soon
            </span>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section className={Style.section} id="how-it-works">
        <h2 className={Style.sectionTitle}>How it works</h2>
        <div className={Style.stepsGrid}>
          {steps.map((step) => (
            <div key={step.num} className={Style.step}>
              <span className={Style.stepNum}>{step.num}</span>
              <h3 className={Style.stepTitle}>{step.title}</h3>
              <p className={Style.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className={Style.section} id="features">
        <h2 className={Style.sectionTitle}>Built for the real world</h2>
        <div className={Style.featureGrid}>
          {features.map((f) => (
            <div key={f.title} className={Style.feature}>
              <i className={`${f.icon} ${Style.featureIcon}`} />
              <h3 className={Style.featureName}>{f.title}</h3>
              <p className={Style.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Requirements ─────────────────────────────────────────── */}
      <section className={Style.section} id="requirements">
        <h2 className={Style.sectionTitle}>System requirements</h2>
        <div className={Style.reqGrid}>
          <div className={Style.reqCard}>
            <h3 className={Style.reqHeading}>
              <i className="fa-solid fa-upload" /> Source PC
            </h3>
            <ul className={Style.reqList}>
              <li>Windows 10 or 11</li>
              <li>.NET Framework 4.x</li>
              <li>PowerShell 5+</li>
              <li>Administrator privileges</li>
            </ul>
          </div>
          <div className={Style.reqCard}>
            <h3 className={Style.reqHeading}>
              <i className="fa-solid fa-download" /> Target PC
            </h3>
            <ul className={Style.reqList}>
              <li>Any Windows PC</li>
              <li>Free disk space &ge; 1.2&times; source used space</li>
              <li>WHPX-capable CPU recommended (not required)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Open Source ───────────────────────────────────────────── */}
      <section className={`${Style.section} ${Style.openSource}`}>
        <h2 className={Style.sectionTitle}>Free &amp; open source</h2>
        <p className={Style.openSourceDesc}>
          PortaPuter is open source software. Inspect every line, build from
          source, contribute improvements.
        </p>
        <a
          href="https://github.com/aaronrohrbacher/portaputer"
          className={Style.githubLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fa-brands fa-github" />
          View on GitHub
        </a>
      </section>
    </main>
  );
}
