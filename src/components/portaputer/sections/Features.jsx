import Style from '../PortaputerPage.module.scss';

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
    title: 'Portable package',
    desc: 'Your OS, apps, files, and the entire VM runtime — bundled into one folder you can copy anywhere.',
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

export default function Features() {
  return (
    <section className={Style.section}>
      <header className={Style.pageHeader}>
        <h1 className={Style.pageTitle}>Built for the real world</h1>
        <p className={Style.pageIntro}>
          Six things PortaPuter does so you don&apos;t have to think about
          them.
        </p>
      </header>
      <div className={Style.featureGrid}>
        {features.map((f) => (
          <div key={f.title} className={Style.feature}>
            <i className={`${f.icon} ${Style.featureIcon}`} />
            <h2 className={Style.featureName}>{f.title}</h2>
            <p className={Style.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
