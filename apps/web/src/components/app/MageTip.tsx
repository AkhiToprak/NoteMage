import ui from './ui.module.css';

/** The "MAGE TIP" callout that recurs across the screens — a label + line of
 *  copy with the mascot peeking from the right. `panel` is the white bordered
 *  card (Paths/Profile); `soft` is the compact lilac card (Dashboard rail). */
export default function MageTip({
  text,
  mascot = '/mascot/pointing-left-v2.png',
  variant = 'panel',
}: {
  text: string;
  mascot?: string;
  variant?: 'panel' | 'soft';
}) {
  return (
    <div className={`${ui.tip} ${variant === 'soft' ? ui.tipSoft : ui.tipPanel}`}>
      <div className={ui.tipBody}>
        <span className={ui.tipLabel}>MAGE TIP</span>
        <p className={ui.tipText}>{text}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={ui.tipMascot} src={mascot} alt="" />
    </div>
  );
}
