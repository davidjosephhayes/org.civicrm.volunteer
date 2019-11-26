/*
*  AngularJs Modal Directive
*  https://jasonwatmore.com/post/2016/07/13/angularjs-custom-modal-example-tutorial
*/

(function (angular, $, _) {
  'use strict';

    angular
    .module('volunteer.modal', [])
    .factory('volunteerModalService', function() {
      var modals = []; // array of modals on the page
      var service = {};

      service.add = add;
      service.remove = remove;
      service.open = open;
      service.close = close;

      return service;

      function add(modal) {
        // add modal to array of active modals
        modals.push(modal);
      }
      
      function remove(id) {
        // remove modal from array of active modals
        var modalToremove = _.findWhere(modals, { id: id });
        modals = _.without(modals, modalToremove);
      }

      function open(id) {
        // open modal specified by id
        var modal = _.findWhere(modals, { id: id });
        modal.open();
      }

      function close(id) {
        // close modal specified by id
        var modal = _.findWhere(modals, { id: id });
        modal.close();
      }
    })
    .directive('volunteerModal', ['volunteerModalService',
      function(volunteerModalService) {
        return {
          restrict : 'A',
          link: function (scope, element, attrs) {
            // ensure id attribute exists
            if (!attrs.id) {
              console.error('modal must have an id');
              return;
            }

            // move element to bottom of CiviCRM stuff
            element
            .appendTo('body')
            .addClass('crm-vol-modal crm-container');

            // close modal on esc press
            document.addEventListener("keydown", function(e){
              if (e.code!=='Escape')
                return;
              scope.$evalAsync(close);
            });

            // close modal on background click
            element.on('click', function (e) {
              var target = $(e.target);
              if (!target.closest('.modal-body').length) {
                scope.$evalAsync(close);
              }
            });

            // add self (this modal instance) to the modal service so it's accessible from controllers
            var modal = {
              id: attrs.id,
              open: open,
              close: close
            };
            volunteerModalService.add(modal);
        
            // remove self from modal service when directive is destroyed
            scope.$on('$destroy', function() {
              volunteerModalService.remove(attrs.id);
              element.remove();
            });                

            // open modal
            function open() {
              element.show();
              $('body').addClass('modal-open');
            }

            // close modal
            function close() {
              element.hide();
              $('body').removeClass('modal-open');
            }
          }
        }
      }
    ]);

})(angular, CRM.$, CRM._);