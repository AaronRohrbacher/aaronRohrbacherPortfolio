import Style from '../PortaputerPage.module.scss';

export default function Requirements() {
  return (
    <section className={Style.section}>
      <header className={Style.pageHeader}>
        <h1 className={Style.pageTitle}>System requirements</h1>
        <p className={Style.pageIntro}>
          What you need on each end — the PC you&apos;re capturing, and the
          one you&apos;ll run the VM on.
        </p>
      </header>
      <div className={Style.reqGrid}>
        <div className={Style.reqCard}>
          <h2 className={Style.reqHeading}>
            <i className="fa-solid fa-upload" /> Source PC
          </h2>
          <ul className={Style.reqList}>
            <li>Windows 10 or 11</li>
            <li>.NET Framework 4.x</li>
            <li>PowerShell 5+</li>
            <li>Administrator privileges</li>
          </ul>
        </div>
        <div className={Style.reqCard}>
          <h2 className={Style.reqHeading}>
            <i className="fa-solid fa-download" /> Target PC
          </h2>
          <ul className={Style.reqList}>
            <li>Any Windows PC</li>
            <li>Free disk space &ge; 1.2&times; source used space</li>
            <li>WHPX-capable CPU recommended (not required)</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
