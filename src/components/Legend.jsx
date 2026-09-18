import { pixelSizeForMag } from '../lib/color.js';

export default function Legend() {
  return (
    <div className="panel legend">
      <div className="legend-block">
        <h3>深さ</h3>
        <div className="depth-gradient" />
        <div className="depth-ticks"><span>0km</span><span>350km</span><span>700km+</span></div>
      </div>
      <div className="legend-block">
        <h3>マグニチュード</h3>
        <div className="mag-legend">
          {[3, 5, 7].map((mag) => {
            const px = Math.round(pixelSizeForMag(mag));
            return (
              <div className="mag-item" key={mag}>
                <div className="mag-dot" style={{ width: px, height: px }} />
                <span>M{mag}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
