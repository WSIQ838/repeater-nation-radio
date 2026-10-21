import { GMRS_EMOTE_MAP } from './gmrsEmotes';
import { linkifyText } from '@/components/shared/Linkify';

// Splits a message body into text segments and inline GMRS emote images,
// rendering shortcodes like :over: as small inline images, and makes links
// in the text clickable.
export default function MessageBody({ body, linkClassName = '' }) {
  if (!body) return null;
  const parts = body.split(/(:[a-z0-9]+:)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const url = GMRS_EMOTE_MAP[part];
        if (url) {
          return (
            <img
              key={i}
              src={url}
              alt={part}
              title={part}
              className="inline-block w-6 h-6 align-middle mx-0.5 object-contain"
            />
          );
        }
        return <span key={i}>{linkifyText(part, { keyPrefix: `${i}-`, linkClassName })}</span>;
      })}
    </p>
  );
}