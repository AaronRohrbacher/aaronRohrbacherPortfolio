import Style from '../PortaputerPage.module.scss';

export default function OpenSource() {
  return (
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
  );
}
