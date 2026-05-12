import Style from '../PortaputerPage.module.scss';

const items = [
  {
    icon: 'fa-solid fa-circle-exclamation',
    title: 'VM window closes immediately',
    desc: (
      <>
        Open <code>%USERPROFILE%\PortaPuterVM\qemu.log</code> (next to <code>Launcher.exe</code>). It logs every QEMU invocation and exit code — the last few lines almost always tell you what went wrong.
      </>
    ),
  },
  {
    icon: 'fa-solid fa-shield-halved',
    title: 'Windows asks for the BitLocker key',
    desc: (
      <>
        Use the key saved during capture — <code>Desktop\PortaPuter-BitLocker-Recovery.txt</code> on the source PC. This can happen on the host after capture if firmware or boot settings shift.
      </>
    ),
  },
  {
    icon: 'fa-solid fa-hard-drive',
    title: 'Boot loops or 0x7B BSOD',
    desc: (
      <>
        The captured Windows can&apos;t find a SATA driver. Try the <strong>Safe Mode</strong> shortcut first. If that fails, edit <code>vm.conf</code> in <code>%USERPROFILE%\PortaPuterVM</code> and switch the disk bus to <code>virtio</code> (see the inline comments).
      </>
    ),
  },
  {
    icon: 'fa-solid fa-key',
    title: 'Windows says "not activated"',
    desc: 'Cosmetic. The OEM activation is tied to the original machine\'s hardware, so the VM may show as deactivated. Windows still runs normally.',
  },
  {
    icon: 'fa-solid fa-floppy-disk',
    title: 'Not enough space on the destination',
    desc: 'The output is roughly the used space on C: (Disk2vhd skips free blocks). Make sure the destination drive has at least 1.2× that much free before installing.',
  },
];

export default function Troubleshooting() {
  return (
    <section className={Style.section}>
      <header className={Style.pageHeader}>
        <h1 className={Style.pageTitle}>Troubleshooting</h1>
        <p className={Style.pageIntro}>
          The handful of things that occasionally go sideways — and exactly
          what to do about each.
        </p>
      </header>
      <div className={Style.troubleGrid}>
        {items.map((t) => (
          <div key={t.title} className={Style.trouble}>
            <i className={`${t.icon} ${Style.troubleIcon}`} />
            <h2 className={Style.troubleTitle}>{t.title}</h2>
            <p className={Style.troubleDesc}>{t.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
