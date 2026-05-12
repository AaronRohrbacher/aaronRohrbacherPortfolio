import Style from '../PortaputerPage.module.scss';

export default function Hero() {
  return (
    <section className={Style.hero}>
      <div className={Style.heroInner}>
        <h1 className={Style.title}>PortaPuter</h1>
        <p className={Style.tagline}>Your entire PC, one double-click away.</p>
        <p className={Style.subtitle}>
          Capture a live Windows desktop into a portable package. Copy it
          to any PC, double-click, and your old desktop boots in a window —
          no installation, no hypervisor, no fuss.
        </p>

        <div className={Style.cta}>
          <a
            href="/api/portaputer/download"
            className={Style.downloadBtn}
            rel="nofollow noopener"
          >
            <i className="fa-brands fa-windows" />
            Download for Windows
          </a>
          <span className={Style.versionNote}>v0.1 &middot; Free &amp; open source</span>
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
  );
}
