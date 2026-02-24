import { LovelaceCardConfig } from 'custom-card-helpers';

// Entity coordinate configuration for dynamic location from entity attributes
export interface EntityCoordinate {
  entity: string;
  latitude_attribute?: string; // Default: 'latitude'
  longitude_attribute?: string; // Default: 'longitude'
}

// Coordinate can be a number, entity ID string, or entity config object
export type CoordinateConfig = number | string | EntityCoordinate;

// TODO Add your configuration elements here for type-checking
export interface WeatherRadarCardConfig extends LovelaceCardConfig {
  maptiler_api_key?: string;
  show_marker: boolean;
  show_playback: boolean;
  show_recenter: boolean;
  static_map: boolean;
  show_zoom: boolean;
  height?: string;
  width?: string;
  // Base coordinates (used on all devices)
  marker_longitude?: CoordinateConfig;
  marker_latitude?: CoordinateConfig;
  center_longitude?: CoordinateConfig;
  center_latitude?: CoordinateConfig;
  // Mobile-specific overrides (used when device detected as mobile)
  mobile_marker_longitude?: CoordinateConfig;
  mobile_marker_latitude?: CoordinateConfig;
  mobile_center_longitude?: CoordinateConfig;
  mobile_center_latitude?: CoordinateConfig;
  zoom_level: undefined;
  type: string;
  name?: string;
  map_style?: string;
  show_warning?: boolean;
  show_error?: boolean;
  test_gui?: boolean;
  show_header_toggle?: boolean;
  hour_format?: '12' | '24';
  past_duration?: number;
  future_duration?: number;
  autoplay?: boolean;
  now_pause_duration?: number;
  animation_speed?: number;
  show_projection?: boolean;
  default_projection?: 'globe' | 'mercator';
  default_layer?: 'radar' | 'precipitation' | 'temperature' | 'wind';
}
