import './style.less';
import { observer } from 'mobx-react-lite';
import { Social } from '@/modules/social/social';
import { CHAT_LINE_HEIGHT, CHAT_LINE_STYLE } from '@/modules/chat/chat';
import { MuText } from '@/controllers/interface/components/mu_text';
import { DEFAULT_SCALE } from '@/controllers/interface/windowManager';
import { stableKeyOf } from '@/core/stableKey';

/** Ours (`systemLinesCorner`): the last three system and error lines at the top left, the chat log keeps the chat. */
export const SystemLines = observer(() => {
  const lines = Social.cornerSystemLines;
  if (lines.length === 0) return null;
  return (
    <div className="system-lines">
      {lines.map(line => {
        const style = CHAT_LINE_STYLE[line.type];
        return (
          <div key={stableKeyOf(line)} className="system-line" style={{ height: CHAT_LINE_HEIGHT * DEFAULT_SCALE }}>
            <MuText text={line.text} color={style.color} background={style.bg} style={{ transform: `scale(${DEFAULT_SCALE})`, transformOrigin: 'left top' }} />
          </div>
        );
      })}
    </div>
  );
});
