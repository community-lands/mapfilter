// MapFilter.InfoPane
// ------------------

// The InfoPane manages the display of the attributes and media associated
// with a point. It appears on mouseover/hover of a point, but if you click
// the point then it will "stick" open.
'use strict'

var $ = require('jquery')
var tpl = require('../../../templates/info-pane.tpl')

module.exports = require('backbone').View.extend({
  events: {
    'click .close': 'close'
  },

  initialize: function (options) {
    options = options || {}

    if (options.id) this.$el.attr('id', options.id)
    this.template = tpl
  },

  // Populates the infopane contents with the data from the selected point
  render: function () {
    var infoPaneTop = '<button type="button" class="close pull-right" aria-hidden="true">&times;</button>' +
                      '<div class="map-icon"></div>'
    this.$el.html(infoPaneTop + this.template(this.model))
    this.$('.map-icon').html($(this.model.icon).html())
    this.$('.map-icon').addClass($(this.model.icon).attr('class'))
    return this
  },

  show: function (options) {
    if (this.sticky()) return
    this.hide()
    this.model = options.model
    this.iconView = options.iconView
    this.render()
    this.sticky(options.sticky)
    this.$el.show()
  },

  toggle: function (options) {
    this.sticky(false)
    if (this.iconView === options.iconView) {
      this.hide()
      this.iconView = null
    } else {
      if (this.iconView) this.iconView.$el.removeClass('clicked')
      this.show(options)
    }
  },

  sticky: function (sticky) {
    if (typeof sticky === 'undefined') return this._sticky
    if (sticky) {
      this.$el.addClass('sticky')
    } else {
      this.$el.removeClass('sticky')
    }
    this._sticky = sticky
  },

  close: function () {
    this.sticky(false)
    if (this.iconView) this.iconView.$el.removeClass('hover clicked')
    this.hide()
  },

  hide: function () {
    if (this.sticky()) return
    this.$el.hide()
  }
})
