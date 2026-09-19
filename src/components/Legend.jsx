export default function Legend() {
  return (
    <div className="panel legend">
      <div className="legend-block">
        <h3>深さ</h3>
        <div className="depth-gradient" />
        <div className="depth-ticks"><span>0km</span><span>350km</span><span>700km+</span></div>
      </div>
    </div>
  );
}
