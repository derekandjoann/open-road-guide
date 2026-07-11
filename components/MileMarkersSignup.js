// Mile Markers — the Open Road Guide newsletter signup.
//
// One shared component so the Buttondown username lives in exactly one place.
// Rendered in the site footer (variant="footer", dark) and at the end of every
// story (variant="story", light). This is a server component on purpose: the
// form is a plain HTML POST to Buttondown's embed endpoint, which needs no
// JavaScript — submitting opens Buttondown's own "check your email" page.
//
// If the Buttondown username ever changes, change BUTTONDOWN_USERNAME below
// and re-upload this one file. Nothing else references it.

const BUTTONDOWN_USERNAME = 'openroadguide';

const ACTION = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

export default function MileMarkersSignup({ variant = 'story' }) {
  const dark = variant === 'footer';

  const s = {
    wrap: {
      background: dark ? 'transparent' : '#fff',
      border: dark ? 'none' : '1px solid #ececec',
      borderTop: dark ? 'none' : '4px solid #FF6B6B',
      borderRadius: dark ? 0 : '14px',
      padding: dark ? 0 : 'clamp(1.5rem, 4vw, 2rem)',
      maxWidth: dark ? 'none' : '44rem',
      margin: dark ? 0 : '0 auto',
    },
    eyebrow: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: dark ? '#FFD93D' : '#FF6B6B',
      marginBottom: '0.5rem',
    },
    title: {
      fontFamily: "'Fraunces', Georgia, serif",
      fontSize: dark ? '1.25rem' : 'clamp(1.4rem, 3.5vw, 1.7rem)',
      fontWeight: 600,
      margin: '0 0 0.5rem 0',
      lineHeight: 1.15,
      color: dark ? '#fff' : '#1a1a2e',
    },
    blurb: {
      fontSize: '0.95rem',
      lineHeight: 1.55,
      color: dark ? 'rgba(255,255,255,0.72)' : '#444',
      margin: '0 0 1rem 0',
      maxWidth: '34rem',
    },
    form: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.6rem',
      alignItems: 'stretch',
    },
    input: {
      flex: '1 1 220px',
      minWidth: 0,
      padding: '0.7rem 0.9rem',
      fontSize: '15px',
      fontFamily: "'Outfit', sans-serif",
      color: '#1a1a2e',
      background: '#fff',
      border: dark ? '1px solid rgba(255,255,255,0.25)' : '1px solid #d8d5cf',
      borderRadius: '10px',
      outline: 'none',
    },
    button: {
      flex: '0 0 auto',
      padding: '0.7rem 1.4rem',
      fontSize: '15px',
      fontWeight: 600,
      fontFamily: "'Outfit', sans-serif",
      color: '#fff',
      background: '#FF6B6B',
      border: 'none',
      borderRadius: '10px',
      cursor: 'pointer',
    },
    fineprint: {
      fontSize: '0.78rem',
      color: dark ? 'rgba(255,255,255,0.45)' : '#999',
      margin: '0.75rem 0 0 0',
    },
  };

  return (
    <div style={s.wrap}>
      <div style={s.eyebrow}>Mile Markers</div>
      <h2 style={s.title}>One letter a month. Worth the stamp.</h2>
      <p style={s.blurb}>
        One story, one drive, and one marker worth a detour — from the road, not
        a content calendar. No noise, unsubscribe anytime.
      </p>
      <form action={ACTION} method="post" style={s.form}>
        <input type="hidden" value="1" name="embed" />
        <input
          type="email"
          name="email"
          required
          placeholder="you@wherever.com"
          aria-label="Email address"
          style={s.input}
        />
        <button type="submit" style={s.button}>
          Sign up
        </button>
      </form>
      <p style={s.fineprint}>Free. Monthly. Written by a person.</p>
    </div>
  );
}
