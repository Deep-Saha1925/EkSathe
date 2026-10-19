'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  AttributionControl,
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

const KOLKATA = [22.5726, 88.3639];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeIcon({ color, display_name, isMe, status }) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#FF5C5C';
  const html = `<div class="pp-marker ${isMe ? 'pp-me' : ''} ${status === 'stale' ? 'pp-faded' : ''}" style="--c:${safeColor}"><span class="pp-dot"></span><span class="pp-label">${esc(display_name)}${isMe ? ' (You)' : ''}</span></div>`;
  return L.divIcon({ html, className: 'pp-icon', iconSize: [0, 0], iconAnchor: [0, 0] });
}

function MemberMarker({ member }) {
  const icon = useMemo(
    () => makeIcon(member),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member.color, member.display_name, member.isMe, member.status]
  );
  return <Marker position={[member.lat, member.lng]} icon={icon} zIndexOffset={member.isMe ? 1000 : 0} />;
}

function buildLines(list) {
  const out = [];
  if (list.length < 2) return out;
  if (list.length <= 8) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        out.push({
          key: `${list[i].id}-${list[j].id}`,
          positions: [
            [list[i].lat, list[i].lng],
            [list[j].lat, list[j].lng],
          ],
        });
      }
    }
  } else {
    for (let i = 1; i < list.length; i++) {
      out.push({
        key: `${list[i - 1].id}-${list[i].id}`,
        positions: [
          [list[i - 1].lat, list[i - 1].lng],
          [list[i].lat, list[i].lng],
        ],
      });
    }
  }
  return out;
}

function MapController({ points, me, command }) {
  const map = useMap();
  const interacted = useRef(false);
  const programmatic = useRef(false);
  const didInitialFit = useRef(false);
  const prevCount = useRef(0);
  const pointsRef = useRef(points);
  const meRef = useRef(me);
  const lastCmd = useRef(command.n);

  pointsRef.current = points;
  meRef.current = me;

  useMapEvents({
    dragstart: () => {
      interacted.current = true;
    },
    zoomstart: () => {
      if (!programmatic.current) interacted.current = true;
    },
    moveend: () => {
      programmatic.current = false;
    },
  });

  function fit(pts) {
    if (!pts.length) return;
    programmatic.current = true;
    setTimeout(() => {
      programmatic.current = false;
    }, 1500);
    if (pts.length === 1) {
      map.setView(pts[0], Math.max(map.getZoom(), 16));
    } else {
      map.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [40, 110],
        paddingBottomRight: [40, 280],
        maxZoom: 17,
      });
    }
  }

  // Auto-fit on first positions and when someone joins, but only until the user moves the map.
  useEffect(() => {
    const count = points.length;
    if (count > 0 && !interacted.current && (!didInitialFit.current || count > prevCount.current)) {
      didInitialFit.current = true;
      fit(points);
    }
    prevCount.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  useEffect(() => {
    if (command.n === lastCmd.current) return;
    lastCmd.current = command.n;
    if (command.type === 'fit') {
      interacted.current = false;
      fit(pointsRef.current);
    } else if (command.type === 'me' && meRef.current) {
      interacted.current = true;
      programmatic.current = true;
      setTimeout(() => {
        programmatic.current = false;
      }, 1500);
      map.flyTo([meRef.current.lat, meRef.current.lng], Math.max(map.getZoom(), 16));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.n]);

  return null;
}

export default function GroupMap({ members, command }) {
  const points = useMemo(() => members.map((m) => [m.lat, m.lng]), [members]);
  const linked = useMemo(() => members.filter((m) => m.status === 'live' || m.status === 'updating'), [members]);
  const lines = useMemo(() => buildLines(linked), [linked]);
  const me = members.find((m) => m.isMe);

  return (
    <MapContainer
      center={KOLKATA}
      zoom={13}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <AttributionControl position="topleft" prefix={false} />
      <MapController points={points} me={me} command={command} />

      {lines.map((l) => (
        <Polyline
          key={l.key}
          positions={l.positions}
          pathOptions={{ color: '#0ea5e9', weight: 3, opacity: 0.75, dashArray: '6 8' }}
        />
      ))}

      {me && me.accuracy > 0 && me.accuracy < 300 && (
        <Circle
          center={[me.lat, me.lng]}
          radius={me.accuracy}
          pathOptions={{ color: me.color, weight: 1, fillColor: me.color, fillOpacity: 0.1 }}
        />
      )}

      {members.map((m) => (
        <MemberMarker key={m.id} member={m} />
      ))}
    </MapContainer>
  );
}
