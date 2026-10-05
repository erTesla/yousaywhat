// Centred single-line message, used for connecting / verifying / loading and
// terminal error states. Previously redefined identically in six page files.
export default function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}
