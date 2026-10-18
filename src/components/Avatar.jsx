// Foto del jugador o club; sin foto, la inicial del nombre
export default function Avatar({ src, name, className = "avatar" }) {
  return src ? (
    <img src={src} alt="" className={className} />
  ) : (
    <span className={className} aria-hidden="true">{(name ?? "?").trim().charAt(0).toUpperCase()}</span>
  );
}
