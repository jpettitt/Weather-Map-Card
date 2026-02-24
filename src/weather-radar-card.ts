import { LitElement, html, css, CSSResult, TemplateResult, PropertyValues, CSSResultGroup } from 'lit';
import { property, customElement, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, LovelaceCard } from 'custom-card-helpers';
import { Map, MapStyle, config as maptilerConfig, ScaleControl, NavigationControl, Marker } from '@maptiler/sdk';
import { RadarLayer, PrecipitationLayer, TemperatureLayer, WindLayer } from '@maptiler/weather';

import './editor';

import { WeatherRadarCardConfig, CoordinateConfig } from './types';
import { CARD_VERSION } from './const';

import { localize } from './localize/localize';

/* eslint no-console: 0 */
console.info(
  `%c  WEATHER-RADAR-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards = (window as any).customCards || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards.push({
  type: 'weather-radar-card',
  name: 'Weather Radar Card',
  description: 'A rain radar card using the new tiled images from RainViewer',
});

// TODO Name your custom element
@customElement('weather-radar-card')
export class WeatherRadarCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('weather-radar-card-editor') as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  @property({ type: Boolean, reflect: true })
  public isPanel = false;

  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) private _config!: WeatherRadarCardConfig;
  @property({ attribute: false }) public editMode?: boolean;

  private map?: Map;
  private weatherLayer?: RadarLayer;
  
  // Use explicit state properties for reactivity
  @state() private _currentTime: string = '';
  @state() private _isForecast: boolean = false;
  @state() private _pointerValue: string = '';
  @state() private _projection: 'globe' | 'mercator' = 'globe';
  @state() private _isPlaying: boolean = false;
  @state() private _animationStart: number = 0;
  @state() private _animationEnd: number = 0;
  @state() private _animationTime: number = 0;
  
  private _lastAnimationTime: number = 0;
  @state() private _isPausedAtNow: boolean = false;
  @state() private _currentLayerType: string = 'radar';
  @state() private _showLayerMenu: boolean = false;
  private _markerLngLat: { lng: number; lat: number } | null = null;
  private _marker?: any;
  private _resizeObserver?: ResizeObserver;
  private _refreshTimer?: any;

  connectedCallback() {
    super.connectedCallback();
    // Re-attach resize observer if re-connected
    if (!this._resizeObserver && this.shadowRoot) {
      setTimeout(() => {
        const rootEl = this.shadowRoot?.getElementById('root');
        if (rootEl) {
          this._resizeObserver = new ResizeObserver(() => {
            if (this.map) this.map.resize();
          });
          this._resizeObserver.observe(rootEl);
        }
      }, 0);
    }
    this._startRefreshTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopRefreshTimer();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
    // We intentionally DO NOT destroy this.map here, 
    // because Home Assistant frequently detaches and reattaches elements during dashboard edits.
  }

  public setConfig(config: WeatherRadarCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    /*   if (!config || config.show_error) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }*/

    if (config.height && config.square_map) {
      console.warn(
        "Weather Radar Card: Both 'height' and 'square_map' are configured. Custom height will take priority.",
      );
    }

    if (config.height && !this._validateCssSize(config.height)) {
      console.warn(
        `Weather Radar Card: Invalid height value '${config.height}'. Must be a number followed by a CSS unit (px, %, em, rem, vh, vw). Using default height.`,
      );
    }

    if (config.width && !this._validateCssSize(config.width)) {
      console.warn(
        `Weather Radar Card: Invalid width value '${config.width}'. Must be a number followed by a CSS unit (px, %, em, rem, vh, vw). Using default width.`,
      );
    }

    // Validate coordinate configurations
    this._validateCoordinateConfig('center_latitude', config.center_latitude);
    this._validateCoordinateConfig('center_longitude', config.center_longitude);
    this._validateCoordinateConfig('marker_latitude', config.marker_latitude);
    this._validateCoordinateConfig('marker_longitude', config.marker_longitude);
    this._validateCoordinateConfig('mobile_center_latitude', config.mobile_center_latitude);
    this._validateCoordinateConfig('mobile_center_longitude', config.mobile_center_longitude);
    this._validateCoordinateConfig('mobile_marker_latitude', config.mobile_marker_latitude);
    this._validateCoordinateConfig('mobile_marker_longitude', config.mobile_marker_longitude);

    this._config = config;
  }

  // #####
  // ##### Sets the card size so HA knows how to put in columns
  // #####

  getCardSize(): number {
    return 10;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has('_config') || changedProps.has('hass')) {
      this._updateMarker();
    }
  }



  /**
   * Validates coordinate configuration format
   * Logs warnings for invalid configs but doesn't throw errors
   */
  private _validateCoordinateConfig(fieldName: string, value: CoordinateConfig | undefined): void {
    if (value === undefined || value === null) {
      return; // Optional field
    }

    // Number is always valid
    if (typeof value === 'number') {
      return;
    }

    // String should look like an entity ID
    if (typeof value === 'string') {
      if (!value.includes('.')) {
        console.warn(
          `Weather Radar Card: '${fieldName}' value '${value}' does not look like a valid entity ID. Expected format: 'domain.entity_name'`,
        );
      }
      return;
    }

    // Object should have required fields
    if (typeof value === 'object') {
      if (!value.entity || typeof value.entity !== 'string') {
        console.warn(
          `Weather Radar Card: '${fieldName}' entity config missing required 'entity' field`,
        );
      }
      if (value.latitude_attribute && typeof value.latitude_attribute !== 'string') {
        console.warn(
          `Weather Radar Card: '${fieldName}' latitude_attribute must be a string`,
        );
      }
      if (value.longitude_attribute && typeof value.longitude_attribute !== 'string') {
        console.warn(
          `Weather Radar Card: '${fieldName}' longitude_attribute must be a string`,
        );
      }
      return;
    }

    console.warn(
      `Weather Radar Card: Invalid type for '${fieldName}'. Expected number, entity ID string, or entity config object.`,
    );
  }

  /**
   * Detects if the current device is mobile
   * Checks Home Assistant Companion app, mobile user agents, and screen width
   */
  private _isMobileDevice(): boolean {
    // Check 1: Home Assistant Companion app user agent
    const userAgent = navigator.userAgent.toLowerCase();
    const isHAApp = userAgent.includes('home assistant');

    // Check 2: Common mobile user agents
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

    // Check 3: Screen width (mobile-sized)
    const isMobileScreen = window.innerWidth <= 768;

    // Device is mobile if it's the HA app OR (mobile UA AND mobile screen)
    return isHAApp || (isMobileUA && isMobileScreen);
  }

  /**
   * Returns appropriate coordinate config based on device type
   * Mobile overrides take precedence when device is detected as mobile
   */
  private _getCoordinateConfig(
    baseConfig: CoordinateConfig | undefined,
    mobileConfig: CoordinateConfig | undefined,
    isMobile: boolean,
  ): CoordinateConfig | undefined {
    // If mobile and mobile override exists, use it
    if (isMobile && mobileConfig !== undefined) {
      return mobileConfig;
    }
    // Otherwise use base config
    return baseConfig;
  }

  /**
   * Extracts coordinate from entity attributes with validation
   */
  private _getCoordinateFromEntity(
    entityId: string,
    coordType: 'latitude' | 'longitude',
    attributeName: string,
  ): number | null {
    // Check if entity exists
    const entityState = this.hass?.states[entityId];
    if (!entityState) {
      console.warn(
        `Weather Radar Card: Entity '${entityId}' not found for ${coordType}. Using fallback.`,
      );
      return null;
    }

    // Extract attribute value
    const value = entityState.attributes[attributeName];

    if (value === undefined || value === null) {
      console.warn(
        `Weather Radar Card: Entity '${entityId}' has no attribute '${attributeName}' for ${coordType}. Using fallback.`,
      );
      return null;
    }

    // Validate numeric value
    const numValue = typeof value === 'number' ? value : parseFloat(value);

    if (isNaN(numValue)) {
      console.warn(
        `Weather Radar Card: Entity '${entityId}' attribute '${attributeName}' is not a valid number ('${value}'). Using fallback.`,
      );
      return null;
    }

    // Validate coordinate ranges
    if (coordType === 'latitude' && (numValue < -90 || numValue > 90)) {
      console.warn(
        `Weather Radar Card: Invalid latitude value ${numValue} from entity '${entityId}'. Must be between -90 and 90. Using fallback.`,
      );
      return null;
    }

    if (coordType === 'longitude' && (numValue < -180 || numValue > 180)) {
      console.warn(
        `Weather Radar Card: Invalid longitude value ${numValue} from entity '${entityId}'. Must be between -180 and 180. Using fallback.`,
      );
      return null;
    }

    return numValue;
  }

  /**
   * Resolves a coordinate configuration to a numeric value
   * Supports: numbers, entity IDs as strings, or entity config objects
   */
  private _resolveCoordinate(
    config: CoordinateConfig | undefined,
    coordType: 'latitude' | 'longitude',
    fallback: number,
  ): number {
    // Return fallback if no config
    if (config === undefined || config === null) {
      return fallback;
    }

    // Direct numeric value (backwards compatible)
    if (typeof config === 'number') {
      return config;
    }

    // String entity ID (simple format)
    if (typeof config === 'string') {
      return (
        this._getCoordinateFromEntity(
          config,
          coordType,
          coordType, // Use coordType as attribute name
        ) ?? fallback
      );
    }

    // Entity config object (advanced format)
    if (typeof config === 'object' && 'entity' in config) {
      const attrName =
        coordType === 'latitude'
          ? config.latitude_attribute || 'latitude'
          : config.longitude_attribute || 'longitude';

      return this._getCoordinateFromEntity(config.entity, coordType, attrName) ?? fallback;
    }

    return fallback;
  }

  /**
   * Resolves a lat/lon pair from configs with intelligent fallback handling
   * Special case: both are same entity string - extract both coordinates atomically
   */
  private _resolveCoordinatePair(
    latConfig: CoordinateConfig | undefined,
    lonConfig: CoordinateConfig | undefined,
    fallbackLat: number,
    fallbackLon: number,
  ): { lat: number; lon: number } {
    // Special case: both are string entity IDs and same entity
    // Extract both coordinates from same entity for atomic resolution
    if (typeof latConfig === 'string' && typeof lonConfig === 'string' && latConfig === lonConfig) {
      const entityState = this.hass?.states[latConfig];
      if (entityState?.attributes?.latitude && entityState?.attributes?.longitude) {
        const lat = parseFloat(entityState.attributes.latitude);
        const lon = parseFloat(entityState.attributes.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          return { lat, lon };
        }
      }
    }

    // Standard resolution: resolve each coordinate independently
    return {
      lat: this._resolveCoordinate(latConfig, 'latitude', fallbackLat),
      lon: this._resolveCoordinate(lonConfig, 'longitude', fallbackLon),
    };
  }

  protected render(): TemplateResult | void {
    if (this._config.show_warning) {
      return this.showWarning(localize('common.show_warning'));
    }

    if (!this._config.maptiler_api_key) {
      return this.showError('MapTiler API Key is missing. Please configure it in the visual editor.');
    }

    const calculatedHeight = this._calculateHeight();
    let padding = calculatedHeight;

    if (this.isPanel && this.offsetParent) {
      padding = `${this.offsetParent.clientHeight - 2 - (this.editMode === true ? 59 : 0)}px`;
    } else if (this._config && this._config.square_map) {
      padding = `${this.getBoundingClientRect().width}px`;
    }

    const cardTitle = this._config.card_title !== undefined ? html`<div id="card-title">${this._config.card_title}</div>` : ``;
    const calculatedWidth = this._calculateWidth();

    return html`
      <style>
        ${this.styles}
        ha-card {
          width: ${calculatedWidth};
        }
      </style>
      <ha-card class="type-maptiler" style="min-height: ${padding}">
        ${cardTitle}
        <div id="root">
          <div id="map"></div>
          
          <div id="time-info" class="map-overlay">
            <span id="time-text">${this._currentTime}</span>
            ${(this._isForecast && !this._isPausedAtNow) ? html`<span id="forecast-tag">Forecast</span>` : ''}
          </div>

          <div id="layer-selector-container">
            <div id="variable-name" class="map-overlay" @click=${this._toggleLayerMenu}>
              ${this._getLayerTitle(this._currentLayerType)}
            </div>
            
            ${this._showLayerMenu ? html`
              <div id="layer-menu" class="map-overlay">
                <div class="layer-option ${this._currentLayerType === 'radar' ? 'active' : ''}" @click=${() => this._setWeatherLayer('radar')}>Radar</div>
                <div class="layer-option ${this._currentLayerType === 'precipitation' ? 'active' : ''}" @click=${() => this._setWeatherLayer('precipitation')}>Precipitation</div>
                <div class="layer-option ${this._currentLayerType === 'temperature' ? 'active' : ''}" @click=${() => this._setWeatherLayer('temperature')}>Temperature</div>
                <div class="layer-option ${this._currentLayerType === 'wind' ? 'active' : ''}" @click=${() => this._setWeatherLayer('wind')}>Wind</div>
              </div>
            ` : ''}
          </div>

          <div class="map-controls">
            ${(this._config.show_playback !== false && String(this._config.show_playback) !== 'false') ? html`
              <div class="control-group playback-group" style="display: ${this._isPlaying ? 'flex' : 'none'};">
                <ha-icon icon="mdi:play" @click=${this._togglePlayback} title="Pause Loop"></ha-icon>
              </div>
              <div class="control-group pause-group" style="display: ${!this._isPlaying ? 'flex' : 'none'};">
                <input 
                  type="range" 
                  class="timeline-slider" 
                  min=${this._animationStart} 
                  max=${this._animationEnd} 
                  .value=${this._animationTime} 
                  @input=${this._onTimelineScrub} 
                />
                <ha-icon icon="mdi:pause" @click=${this._togglePlayback} title="Resume Loop"></ha-icon>
              </div>
            ` : ''}
            
            ${(this._config.show_zoom !== false) ? html`
              <div class="control-group">
                <ha-icon icon="mdi:plus" @click=${this._zoomIn} title="Zoom In"></ha-icon>
                <ha-icon icon="mdi:minus" @click=${this._zoomOut} title="Zoom Out"></ha-icon>
              </div>
            ` : ''}

            ${(this._config.show_recenter !== false && String(this._config.show_recenter) !== 'false') ? html`
              <div class="control-group">
                <ha-icon icon="mdi:crosshairs-gps" @click=${this._recenterMap} title="Recenter"></ha-icon>
              </div>
            ` : ''}

            ${(this._config.show_projection !== false) ? html`
              <div class="control-group">
                <ha-icon icon=${this._projection === 'globe' ? 'mdi:map' : 'mdi:earth'} @click=${this._toggleProjection} title="Toggle Projection"></ha-icon>
              </div>
            ` : ''}
          </div>
        </div>
      </ha-card>
    `;
  }

  protected firstUpdated(): void {
    if (this._config && this._config.maptiler_api_key) {
      this._initializeMap();
      this._startRefreshTimer();
    }
    
    const rootEl = this.shadowRoot?.getElementById('root');
    if (rootEl) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.map) {
           this.map.resize();
        }
      });
      this._resizeObserver.observe(rootEl);
    }
  }

  private _getMapStyle(configStyle?: string): any {
    switch (configStyle?.toLowerCase()) {
      case 'dark':
        return MapStyle.DATAVIZ.DARK;
      case 'streets':
        return MapStyle.STREETS;
      case 'topo':
        return MapStyle.TOPO;
      case 'basic':
        return MapStyle.BASIC;
      case 'bright':
        return MapStyle.BRIGHT;
      case 'backdrop':
      case 'light':
        return MapStyle.BACKDROP;
      case 'outdoor':
        return MapStyle.OUTDOOR;
      default:
        return MapStyle.STREETS;
    }
  }

  private _initializeMap(): void {
    const mapContainer = this.shadowRoot?.getElementById('map') as HTMLElement;
    if (!mapContainer || this.map) return;

    maptilerConfig.apiKey = this._config.maptiler_api_key!;
    
    const isMobile = this._isMobileDevice();
    const centerLatConfig = this._getCoordinateConfig(this._config.center_latitude, this._config.mobile_center_latitude, isMobile);
    const centerLonConfig = this._getCoordinateConfig(this._config.center_longitude, this._config.mobile_center_longitude, isMobile);
    
    const centerCoords = this._resolveCoordinatePair(
      centerLatConfig,
      centerLonConfig,
      this.hass?.config?.latitude ?? 0,
      this.hass?.config?.longitude ?? 0,
    );

    const zoomLevel = this._config.zoom_level !== undefined ? this._config.zoom_level : 6;
    this._projection = this._config.default_projection || 'globe';

    this.map = new Map({
      container: mapContainer,
      style: this._getMapStyle(this._config.map_style),
      zoom: zoomLevel,
      center: [centerCoords.lon, centerCoords.lat],
      hash: false,
      navigationControl: false,
      geolocateControl: false,
      fullscreenControl: false,
      interactive: !this._config.static_map,
      projection: this._projection
    });



    this._currentLayerType = this._config.default_layer || 'radar';
    this.weatherLayer = this._createWeatherLayer(this._currentLayerType);

    const pastHours = Number(this._config.past_duration ?? 1);
    const futureHours = Number(this._config.future_duration ?? 1);
    const showPlayback = this._config.show_playback !== false && (pastHours > 0 || futureHours > 0);
    const autoplay = this._config.autoplay !== false;

    // Register tick handler
    this._attachTickHandler();

    // Initial state setup
    this._refreshTime(); 
    if (showPlayback && autoplay) {
      const speed = this._config.animation_speed ?? 3600;
      this.weatherLayer?.animateByFactor(speed);
      this._isPlaying = true;
    } else {
      // Jump to now and stay paused
      const now = Math.floor(Date.now() / 1000);
      (this.weatherLayer as any).setAnimationTime(now);
      this._isPlaying = false;
      this.weatherLayer?.animateByFactor(0);
      this._refreshTime();
    }

    this.map.on('load', () => {
      // MapTiler backdrop style uses slightly different IDs, we inject below 'Water' if exists
      if (this.map) {
        try {
           this.map.setPaintProperty("Water", 'fill-color', "rgba(0, 0, 0, 0.4)");
           this.map.addLayer(this.weatherLayer as any, 'Water');
        } catch {
           this.map.addLayer(this.weatherLayer as any);
        }
      }

      if (this._config.show_marker !== false) {
        this._updateMarker();
      }

      this.map?.on('mouseout', (evt) => {
        if (!evt.originalEvent.relatedTarget) {
          this._pointerValue = "";
        }
      });
    });
  }

  private _updateMarker() {
    if (!this.map) return;
    
    // Remove existing marker
    if (this._marker) {
      this._marker.remove();
      this._marker = undefined;
    }

    if (this._config.show_marker === false) return;

    const isMobile = this._isMobileDevice();
    const latConfig = this._getCoordinateConfig(this._config.marker_latitude, this._config.mobile_marker_latitude, isMobile);
    const lonConfig = this._getCoordinateConfig(this._config.marker_longitude, this._config.mobile_marker_longitude, isMobile);
    
    const coords = this._resolveCoordinatePair(
      latConfig,
      lonConfig,
      this.hass?.config?.latitude ?? 0,
      this.hass?.config?.longitude ?? 0,
    );

    // Skip if coordinates haven't changed to avoid flickering/removal issues
    if (this._marker && this._markerLngLat && 
        this._markerLngLat.lng === coords.lon && 
        this._markerLngLat.lat === coords.lat) {
      return;
    }

    // Remove existing marker
    if (this._marker) {
      this._marker.remove();
    }

    this._markerLngLat = { lng: coords.lon, lat: coords.lat };
    const el = document.createElement('div');
    el.className = 'home-marker';
    
    this._marker = new Marker({ 
      element: el,
      anchor: 'center'
    })
      .setLngLat([coords.lon, coords.lat])
      .addTo(this.map);
  }

  private _formatTimestamp(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const monthName = months[date.getMonth()];
    
    let hoursNum = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    this._isForecast = date.getTime() > Date.now();
    
    if (this._config.hour_format === '12') {
      const ampm = hoursNum >= 12 ? 'PM' : 'AM';
      hoursNum = hoursNum % 12;
      hoursNum = hoursNum ? hoursNum : 12; // the hour '0' should be '12'
      return `${dayName} ${day} ${monthName} ${hoursNum}:${minutes} ${ampm}`;
    }
    
    const hours = hoursNum.toString().padStart(2, '0');
    return `${dayName} ${day} ${monthName} ${hours}:${minutes}`;
  }

  private _refreshTime(syncToNow = false) {
    if (this.weatherLayer) {
      const now = Math.floor(Date.now() / 1000);

      if (syncToNow && !this._isPlaying) {
        (this.weatherLayer as any).setAnimationTime(now);
      }

      const d = (this.weatherLayer as any).getAnimationTimeDate();
      if (d && !isNaN(d.getTime()) && d.getFullYear() > 2000) {
        this._currentTime = this._formatTimestamp(d);
      }

      let pastHours = Number(this._config.past_duration ?? 1);
      let futureHours = Number(this._config.future_duration ?? 1);
      
      // Enforce limits: Max 8h past, 48h future
      pastHours = Math.min(Math.max(pastHours, 0), 8);
      futureHours = Math.min(Math.max(futureHours, 0), 48);
      
      const requestedStart = now - (pastHours * 3600);
      const requestedEnd = now + (futureHours * 3600);

      const sdkStart = (this.weatherLayer as any).getAnimationStart() || 0;
      const sdkEnd = (this.weatherLayer as any).getAnimationEnd() || 0;

      // Don't let bounds collapse to 0 if data isn't loaded yet
      this._animationStart = (sdkStart !== 0) ? Math.max(requestedStart, sdkStart) : requestedStart;
      this._animationEnd = (sdkEnd !== 0) ? Math.min(requestedEnd, sdkEnd) : requestedEnd;
      
      this._animationTime = (this.weatherLayer as any).getAnimationTime() || 0;
      
      this.requestUpdate();
    }
  }



  private _togglePlayback(e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this.weatherLayer) {
      if (this._isPlaying) {
         this.weatherLayer.animateByFactor(0);
         this._isPlaying = false;
      } else {
         const speed = this._config.animation_speed ?? 3600;
         this.weatherLayer.animateByFactor(speed);
         this._isPlaying = true;
      }
    }
  }

  private _onTimelineScrub(e: Event) {
    const target = e.target as HTMLInputElement;
    const time = parseInt(target.value, 10);
    if (this.weatherLayer) {
      (this.weatherLayer as any).setAnimationTime(time);
      this._animationTime = time;
      const d = (this.weatherLayer as any).getAnimationTimeDate();
      this._currentTime = d ? this._formatTimestamp(d) : '';
      this.requestUpdate();
    }
  }

  private _recenterMap() {
    if (this.map) {
       const isMobile = this._isMobileDevice();
       const centerLatConfig = this._getCoordinateConfig(this._config.center_latitude, this._config.mobile_center_latitude, isMobile);
       const centerLonConfig = this._getCoordinateConfig(this._config.center_longitude, this._config.mobile_center_longitude, isMobile);
      
       const centerCoords = this._resolveCoordinatePair(
          centerLatConfig,
          centerLonConfig,
          this.hass?.config?.latitude ?? 0,
          this.hass?.config?.longitude ?? 0,
       );
       const zoomLevel = this._config.zoom_level !== undefined ? this._config.zoom_level : 7;
       this.map.flyTo({ center: [centerCoords.lon, centerCoords.lat], zoom: zoomLevel });
    }
  }

  private _zoomIn() {
    this.map?.zoomIn();
  }

  private _zoomOut() {
    this.map?.zoomOut();
  }

  private _toggleProjection() {
    if (!this.map) return;
    this._projection = this._projection === 'globe' ? 'mercator' : 'globe';
    this.map.setProjection(this._projection);
  }

  private showWarning(warning: string): TemplateResult {
    return html`
      <hui-warning>${warning}</hui-warning>
    `;
  }

  private showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card') as LovelaceCard;
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this._config,
    });

    return html`
      ${errorCard}
    `;
  }

  private _validateCssSize(value: string | undefined): boolean {
    if (!value) return true;
    const cssUnitRegex = /^\d+(\.\d+)?(px|%|em|rem|vh|vw)$/;
    return cssUnitRegex.test(value.trim());
  }

  private _calculateHeight(): string {
    if (!this._config) {
      return '492px';
    }

    if (this._config.height && this._validateCssSize(this._config.height)) {
      return this._config.height;
    }

    if (this.isPanel) {
      return this.offsetParent
        ? `${this.offsetParent.clientHeight - 48 - 2 - (this.editMode === true ? 59 : 0)}px`
        : '540px';
    }

    return '492px';
  }

  private _calculateWidth(): string {
    if (!this._config) {
      return '100%';
    }

    if (this._config.width && this._validateCssSize(this._config.width)) {
      return this._config.width;
    }
    return '100%';
  }

  get styles(): CSSResult {
    return css`
      .text-container {
        font: 12px/1.5 'Helvetica Neue', Arial, Helvetica, sans-serif;
      }
      #timestamp {
        margin: 2px 0px;
      }
      #color-bar {
        margin: 0px 0px;
      }
      ha-card {
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      #root {
        width: 100%;
        position: relative;
        flex: 1 1 auto;
      }
      /* Attribution banner background */
      #root::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 18px;
        background: rgba(255, 255, 255, 0.3);
        backdrop-filter: blur(2px);
        z-index: 1;
        pointer-events: none;
      }
      #map {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
      }
      /* Optional overlays */
      #time-info {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: var(--card-background-color, white);
    color: var(--primary-text-color, black);
    padding: 4px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 3;
    font-weight: bold;
    font-size: 0.9em;
    border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.1));
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  #time-text {
    flex: 1;
    text-align: center;
  }
  #forecast-tag {
    color: var(--accent-color, orange);
    font-size: 0.8em;
    text-transform: uppercase;
    position: absolute;
    right: 12px;
  }
  .home-marker {
    width: 20px;
    height: 20px;
    background: var(--accent-color, #ff5722);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(0,0,0,0.6);
    cursor: pointer;
    z-index: 10;
  }
      .map-overlay {
        font-family: inherit;
        pointer-events: none;
      }
      #variable-name {
        position: absolute;
        top: 40px;
        left: 12px;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 0.9em;
        font-weight: bold;
        z-index: 10;
        cursor: pointer;
        pointer-events: auto;
        transition: background 0.2s;
      }
      #variable-name:hover {
        background: rgba(0, 0, 0, 0.7);
      }
      #layer-menu {
        position: absolute;
        top: 75px;
        left: 12px;
        background: var(--card-background-color, white);
        color: var(--primary-text-color, black);
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 11;
        padding: 4px 0;
        min-width: 120px;
        pointer-events: auto;
        overflow: hidden;
      }
      .layer-option {
        padding: 8px 16px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .layer-option:hover {
        background: var(--secondary-background-color, #f0f0f0);
      }
      .layer-option.active {
        color: var(--accent-color, #ff5722);
        font-weight: bold;
        background: var(--secondary-background-color, #f0f0f0);
      }
      .map-controls {
        position: absolute;
        right: 16px;
        top: 40px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        z-index: 2;
      }
      .control-group {
        background: var(--card-background-color, white);
        border-radius: 4px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .playback-group, .pause-group {
        flex-direction: row;
        align-items: center;
        border-radius: 20px;
        padding: 0 4px;
        transition: all 0.3s ease;
      }
      .pause-group {
        padding-left: 12px;
      }
      .timeline-slider {
        margin: 0 8px 0 0;
        width: 150px;
        cursor: pointer;
        height: 4px;
        accent-color: var(--primary-color, #03a9f4);
      }
      .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        margin: 0 !important;
        position: absolute !important;
        bottom: 0 !important;
        height: 18px !important;
        padding: 0 8px !important;
        z-index: 2 !important;
        pointer-events: none !important;
      }
      .maplibregl-ctrl-bottom-left {
        left: 0 !important;
      }
      .maplibregl-ctrl-bottom-right {
        right: 0 !important;
      }
      .maplibregl-ctrl-logo {
        transform: scale(0.5);
        transform-origin: left center;
        margin: 0 !important;
        pointer-events: auto !important;
      }
      .maplibregl-ctrl-attrib {
        font-size: 6pt !important;
        background: transparent !important;
        border-radius: 0;
        padding: 0 !important;
        margin: 0 !important;
        line-height: 1.2em;
        white-space: nowrap;
        pointer-events: auto !important;
      }
      .maplibregl-ctrl-attrib a {
        color: #333 !important;
        text-decoration: none !important;
      }
      .maplibregl-ctrl-attrib .maplibregl-compact {
        display: none !important;
      }
      .control-group ha-icon {
        padding: 6px;
        cursor: pointer;
        display: block;
        color: var(--primary-text-color, black);
        border-bottom: 1px solid var(--divider-color, #eee);
      }
      .control-group ha-icon:last-child {
        border-bottom: none;
      }
      .control-group ha-icon:hover {
        background: var(--secondary-background-color, #f0f0f0);
      }
      #card-title {
        margin: 8px 0px 4px 8px;
        font-size: 1.5em;
      }
    `;
  }

  private _createWeatherLayer(type: string): any {
    const options = { opacity: 0.8 };
    switch (type.toLowerCase()) {
      case 'precipitation':
        return new PrecipitationLayer(options);
      case 'temperature':
        return new TemperatureLayer(options);
      case 'wind':
        return new WindLayer(options);
      case 'radar':
      default:
        return new RadarLayer(options);
    }
  }

  private _setWeatherLayer(type: string): void {
    if (!this.map || this._currentLayerType === type) {
      this._showLayerMenu = false;
      return;
    }

    // Remove old layer
    if (this.weatherLayer) {
      this.map.removeLayer(this.weatherLayer.id);
      this.weatherLayer = undefined;
    }

    this._currentLayerType = type;
    this.weatherLayer = this._createWeatherLayer(type);

    // Register tick handler on the new layer
    this._attachTickHandler();

    // Add back to map
    try {
      this.map.addLayer(this.weatherLayer as any, 'Water');
    } catch {
      this.map.addLayer(this.weatherLayer as any);
    }

    // Sync animation state
    const pastHours = Number(this._config.past_duration ?? 1);
    const futureHours = Number(this._config.future_duration ?? 1);
    const showPlayback = this._config.show_playback !== false && (pastHours > 0 || futureHours > 0);
    const autoplay = this._config.autoplay !== false;

    this._refreshTime();
    if (showPlayback && autoplay) {
      const speed = this._config.animation_speed ?? 3600;
      this.weatherLayer?.animateByFactor(speed);
      this._isPlaying = true;
    } else {
      const now = Math.floor(Date.now() / 1000);
      (this.weatherLayer as any).setAnimationTime(now);
      this._isPlaying = false;
      this.weatherLayer?.animateByFactor(0);
      this._refreshTime();
    }

    this._showLayerMenu = false;
  }

  private _attachTickHandler(): void {
    if (!this.weatherLayer) return;
    
    (this.weatherLayer as any).on("tick", () => {
      const currentTime = (this.weatherLayer as any).getAnimationTime();
      const now = Math.floor(Date.now() / 1000);
      const pauseDur = Number(this._config.now_pause_duration ?? 0);

      // Robust loop logic
      if (this._isPlaying && this._animationEnd > this._animationStart) {
        // If we exceed end OR are significantly before start, loop back
        if (currentTime > this._animationEnd || currentTime < (this._animationStart - 3600)) {
          (this.weatherLayer as any).setAnimationTime(this._animationStart);
          this._lastAnimationTime = this._animationStart;
        } else if (!this._isPausedAtNow && pauseDur > 0) {
          // Detect crossing 'now'
          if (currentTime >= now && this._lastAnimationTime < now && this._lastAnimationTime > (now - 3600)) {
             this._isPausedAtNow = true;
             this.weatherLayer?.animateByFactor(0);
             setTimeout(() => {
               this._isPausedAtNow = false;
               if (this._isPlaying) {
                  const speed = this._config.animation_speed ?? 3600;
                  this.weatherLayer?.animateByFactor(speed);
               }
             }, pauseDur * 1000);
          }
        }
      }
      
      this._lastAnimationTime = currentTime;
      this._refreshTime();
    });
  }

  private _getLayerTitle(type: string): string {
    switch (type.toLowerCase()) {
      case 'precipitation': return 'Precipitation';
      case 'temperature': return 'Temperature';
      case 'wind': return 'Wind';
      case 'radar': return 'Radar';
      default: return 'Weather';
    }
  }

  private _toggleLayerMenu(): void {
    this._showLayerMenu = !this._showLayerMenu;
  }

  private _startRefreshTimer() {
    this._stopRefreshTimer();
    // Refresh every 1 minute to keep the "Live" view current
    this._refreshTimer = setInterval(() => {
      this._refreshTime(true);
    }, 60000);
  }

  private _stopRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }
}

// Manual registration as fallback in case decorator doesn't work
if (!customElements.get('weather-radar-card')) {
  customElements.define('weather-radar-card', WeatherRadarCard);
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'weather-radar-card',
  name: 'Weather Radar Card',
  preview: true,
  description: 'A rain radar card using data from MapTiler.',
});
