const debug = require('debug')('mf:mapview')
const React = require('react')
const { PropTypes } = React
const mapboxgl = require('mapbox-gl')
const deepEqual = require('deep-equal')

const MFPropTypes = require('../util/prop_types')
const { getBoundsOrWorld } = require('../util/map_helpers')

const config = require('../../config.json')
const popupTemplate = require('../../templates/popup.hbs')
require('../../node_modules/mapbox-gl/dist/mapbox-gl.css')
require('../../css/popup.css')

/* Mapbox [API access token](https://www.mapbox.com/help/create-api-access-token/) */
mapboxgl.accessToken = config.mapboxToken

const DEFAULT_STYLE = 'mapbox://styles/gmaclennan/cio7mcryg0015akm9b6wur5ic'

const emptyFeatureCollection = {
  type: 'FeatureCollection',
  features: []
}

const style = {
  width: '75%',
  height: '100%',
  position: 'absolute',
  right: 0
}

const pointStyleLayer = {
  id: 'features',
  type: 'symbol',
  source: 'features',
  interactive: true,
  layout: {
    'icon-image': 'marker-{__mf_color}',
    'icon-allow-overlap': true,
    'icon-offset': [0, -10]
  }
}

const pointHoverStyleLayer = {
  id: 'features-hover',
  type: 'symbol',
  source: 'features',
  interactive: false,
  filter: ['==', 'id', ''],
  layout: {
    'icon-image': 'marker-{__mf_color}-hover',
    'icon-allow-overlap': true,
    'icon-offset': [0, -10]
  }
}

const noop = (x) => x

class MapView extends React.Component {
  static defaultProps = {
    mapStyle: DEFAULT_STYLE,
    geojson: emptyFeatureCollection,
    onMarkerClick: noop,
    onMove: noop
  }

  static propTypes = {
    /* map center point [lon, lat] */
    center: PropTypes.array,
    /* Geojson FeatureCollection of features to show on map */
    geojson: PropTypes.shape({
      type: PropTypes.oneOf(['FeatureCollection']).isRequired,
      features: PropTypes.arrayOf(MFPropTypes.mapViewFeature).isRequired
    }),
    /* Current filter (See https://www.mapbox.com/mapbox-gl-style-spec/#types-filter) */
    filter: MFPropTypes.mapboxFilter,
    /**
     * - NOT yet dynamic e.g. if you change it the map won't change
     * Map style. This must be an an object conforming to the schema described in the [style reference](https://mapbox.com/mapbox-gl-style-spec/), or a URL to a JSON style. To load a style from the Mapbox API, you can use a URL of the form `mapbox://styles/:owner/:style`, where `:owner` is your Mapbox account name and `:style` is the style ID. Or you can use one of the predefined Mapbox styles.
     */
    mapStyle: PropTypes.string,
    /**
     * Triggered when a marker is clicked. Called with a (cloned) GeoJson feature
     * object of the marker that was clicked.
     */
    onMarkerClick: PropTypes.func,
    /* Triggered when map is moved, called with map center [lng, lat] */
    onMove: PropTypes.func,
    popupFields: MFPropTypes.popupFields,
    /* map zoom */
    zoom: PropTypes.number
  }

  handleMapMoveOrZoom = (e) => {
    this.props.onMove({
      center: this.map.getCenter().toArray(),
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing()
    })
  }

  handleMapClick = (e) => {
    if (!this.map.loaded()) return
    var features = this.map.queryRenderedFeatures(
      e.point,
      {layers: ['features', 'features-hover']}
    )
    if (!features.length) return
    this.props.onMarkerClick(features[0].properties.id)
  }

  handleMouseMove = (e) => {
    if (!this.map.loaded()) return
    var features = this.map.queryRenderedFeatures(
      e.point,
      {layers: ['features', 'features-hover']}
    )
    this.map.getCanvas().style.cursor = (features.length) ? 'pointer' : ''
    if (!features.length) {
      this.popup.remove()
      this.map.setFilter('features-hover', ['==', 'id', ''])
      return
    }
    var hoveredFeatureId = features[0].properties.id
    this.map.setFilter('features-hover', ['==', 'id', hoveredFeatureId])
    // Popuplate the popup and set its coordinates
    // based on the feature found.
    if (!this.popup._map || hoveredFeatureId && hoveredFeatureId !== this.popup.__featureId) {
      this.popup.setLngLat(features[0].geometry.coordinates)
        .setHTML(this.getPopupHtml(features[0].properties))
        .addTo(this.map)
        .__featureId = hoveredFeatureId
    }
  }

  getPopupHtml (o) {
    const popupFields = this.props.popupFields
    const templateContext = Object.keys(popupFields).reduce((prev, field) => {
      prev[field] = o[popupFields[field]]
      return prev
    }, {})
    return popupTemplate(templateContext)
  }

  render () {
    return (
      <div
        ref={(el) => (this.mapDiv = el)}
        style={style}
      />
    )
  }

  // The first time our component mounts, render a new map into `mapDiv`
  // with settings from props.
  componentDidMount () {
    const { center, filter, mapStyle, geojson, zoom } = this.props

    const map = this.map = window.map = new mapboxgl.Map({
      style: mapStyle,
      container: this.mapDiv,
      center: center || [0, 0],
      zoom: zoom || 0
    })

    // Add zoom and rotation controls to the map.
    map.addControl(new mapboxgl.Navigation())

    this.popup = new mapboxgl.Popup({
      closeButton: false,
      anchor: 'bottom-left'
    })

    map.on('load', () => {
      map.on('moveend', this.handleMapMoveOrZoom)
      map.on('click', this.handleMapClick)
      map.on('mousemove', this.handleMouseMove)
      this.featuresSource = new mapboxgl.GeoJSONSource({data: geojson})
      map.addSource('features', this.featuresSource)
      // TODO: Should choose style based on whether features are point, line or polygon
      map.addLayer(pointStyleLayer)
      map.addLayer(pointHoverStyleLayer)
      if (filter) {
        map.setFilter('features', filter)
      }
    })

    // If no map center or zoom passed, set map extent to extent of marker layer
    if (!center || !zoom) {
      map.fitBounds(getBoundsOrWorld(geojson), {padding: 15})
    }
  }

  componentWillReceiveProps (nextProps) {
    this.moveIfNeeded(nextProps.center, nextProps.zoom)
    const isDataUpdated = this.updateDataIfNeeded(
      nextProps.geojson,
      nextProps.coloredField
    )
    if (isDataUpdated && !nextProps.center || !nextProps.zoom) {
      this.map.fitBounds(getBoundsOrWorld(nextProps.geojson), {padding: 15})
    }
    this.updateFilterIfNeeded(nextProps.filter)
  }

  // We always return false from this function because we don't want React to
  // handle any rendering of the map itself, we do all that via mapboxgl
  shouldComponentUpdate (nextProps) {
    return false
  }

  componentWillUnmount () {
    this.map.remove()
  }

  /**
   * Moves the map to a new position if it is different from the current position
   * @param {array} center new coordinates for center of map
   * @param {number} zoom   new zoom level for map
   * @return {boolean} true if map has moved, otherwise false
   */
  moveIfNeeded (center, zoom) {
    const currentPosition = {
      center: this.map.getCenter().toArray(),
      zoom: this.map.getZoom()
    }
    const newMapPosition = {
      center,
      zoom
    }
    const shouldMapMove = center && zoom &&
      !deepEqual(currentPosition, newMapPosition)
    if (shouldMapMove) {
      debug('Moving map')
      this.map.jumpTo(newMapPosition)
      return true
    }
    return false
  }

  /**
   * [updateDataIfNeeded description]
   * @param {[type]} features     [description]
   * @param {[type]} coloredField [description]
   * @return {[type]} [description]
   */
  updateDataIfNeeded (geojson, coloredField) {
    if (geojson === this.props.geojson &&
        (!coloredField || coloredField === this.props.coloredField)) {
      return
    }
    debug('updated map geojson')
    if (this.map.loaded()) {
      this.featuresSource.setData(geojson)
    } else {
      this.map.on('load', () => this.featuresSource.setData(geojson))
    }
  }

  updateFilterIfNeeded (filter) {
    if (filter !== this.props.filter && filter) {
      debug('new filter')
      if (this.map.style.loaded()) {
        this.map.setFilter('features', filter)
      } else {
        this.map.on('load', () => this.map.setFilter('features', filter))
      }
    }
  }
}

module.exports = MapView
