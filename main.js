import { Map, MapStyle, config } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { RadarLayer } from '@maptiler/weather';

config.apiKey = 'Ake2HFlDvxRcO7uhkxq3';
const map = (window.map = new Map({
  container: 'map', // container's id or the HTML element to render the map
  style: MapStyle.BACKDROP,  // stylesheet location
  zoom: 1.5,
  center: [-15.5, 15.2],
  hash: true,
  projectionControl: true,
  projection: 'globe'
}));

const timeTextDiv = document.getElementById("time-text");
const pointerDataDiv = document.getElementById("pointer-data");
let pointerLngLat = null;

const weatherLayer = new RadarLayer({
  opacity: 0.8,
});

// Called when the animation is progressing
weatherLayer.on("tick", event => {
  refreshTime();
  updatePointerValue(pointerLngLat);
});

map.on('load', function () {
  map.setPaintProperty("Water", 'fill-color', "rgba(0, 0, 0, 0.4)");
  map.addLayer(weatherLayer, 'Water');
  weatherLayer.animateByFactor(3600);
});

map.on('mouseout', function(evt) {
  if (!evt.originalEvent.relatedTarget) {
    pointerDataDiv.innerText = "";
    pointerLngLat = null;
  }
});

// Update the date time display
function refreshTime() {
  const d = weatherLayer.getAnimationTimeDate();
  timeTextDiv.innerText = d.toString();
}

function updatePointerValue(lngLat) {
  if (!lngLat) return;
  pointerLngLat = lngLat;
  const value = weatherLayer.pickAt(lngLat.lng, lngLat.lat);
  if (!value) {
    pointerDataDiv.innerText = "";
    return;
  }
  pointerDataDiv.innerText = `${value.value.toFixed(1)} dBZ`
}

map.on('mousemove', (e) => {
  updatePointerValue(e.lngLat);
});
