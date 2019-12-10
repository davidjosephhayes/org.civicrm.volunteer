(function(angular, $, _) {

  // Declare a list of dependencies.
  angular
    .module('volunteer', CRM.angRequires('volunteer'))

    // Makes lodash/underscore available in templates
    .run(function($rootScope) {
      $rootScope._ = _;
    })

    // Show/hide "loading" spinner between routes
    .run(function($rootScope) {
      $rootScope.$on('$routeChangeStart', function() {
        CRM.$('#crm-main-content-wrapper').block();
      });

      $rootScope.$on('$routeChangeSuccess', function() {
        CRM.$('#crm-main-content-wrapper').unblock();
      });

      $rootScope.$on('$routeChangeError', function() {
        CRM.$('#crm-main-content-wrapper').unblock();
      });

      // the first route that is loaded fires a $routeChangeSuccess event on
      // completing load, but it doesn't raise $routeChangeStart when it starts,
      // so we will just start the app with the spinner going
      CRM.$('#crm-main-content-wrapper').block();
    })

    .filter('plainText', function() {
      return function(textish) {
        return angular.element(textish).text();
      };
    })
    .filter('textShortenerFilter', function() {
      return function(text, length) {
        if (text.length > length) {
          text = text ? String(text).replace(/<[^>]+>/gm, '') : '';
          return text.substr(0, length) + "...";
        }
        return text;
      }
    })

    .factory('volOppSearch', ['crmApi', '$location', '$route', function(crmApi, $location, $route) {
      //Search params and results are stored here and assigned by reference to the form
      var volOppSearch = {};
      var result = {};

      /**
       * This translates the url params with nested key names
       * into a complex object format that Angular can assign to form objects
       * VOL-240
       *
       * @param params
       * @returns complex object
       */
      var parseQueryParams = function(params) {
        var returnParams = {};
        _.each(params, function(value, name) {
          //Get the base name. will return whole key if no mathing bracket is found.
          var basename = name.replace(/([^\[]*)\[.*/g, "$1");
          //If we have subkeys
          if (basename.length < name.length) {
            var tmp = returnParams[basename] || {};
            //This gives us an array of the key of each level
            var path = name.replace(basename + "[", "").slice(0, -1).split("][");
            var ptr = tmp;
            var last = path.length - 1;
            for(var i in path) {
              //Set the value
              if (i == last) {
                ptr[path[i]] = value;
              } else {
                //If the path doesn't exist, create it.
                if(!ptr.hasOwnProperty(path[i])) {
                  ptr[path[i]] = {};
                }
                //Move the Pointer
                ptr = ptr[path[i]];
              }
            }
            //Set the value in our return object.
            returnParams[basename] = tmp;
          } else {
            returnParams[basename] = value;
          }
        });

        // The radius field is of type number; Angular errors if the value is a string
        if (returnParams['proximity'] && returnParams['proximity']['radius']) {
          returnParams['proximity']['radius'] = parseFloat(returnParams['proximity']['radius']);
        }

        return returnParams;
      };

      volOppSearch.params = parseQueryParams($route.current.params);

      var clearResult = function() {
        result = {};
      };

      /**
       * Formats the search params for bookmarkable links.
       *
       * @return string
       */
      var buildQueryString = function () {
        // VOL-187: The beneficiary widget is an entityRef; it expects values as CSV rather than an array.
        if (volOppSearch.params.beneficiary && typeof volOppSearch.params.beneficiary !== "string") {
          volOppSearch.params.beneficiary = volOppSearch.params.beneficiary.join(',');
        }

        // clean up the URL by filtering out those params with falsy values
        var cleanUpSearchParams = function (params) {
          return _.transform(params, function (result, value, key) {
            if (typeof value == 'object') {
              result[key] = cleanUpSearchParams(value);
            } else if (value) {
              result[key] = value;
            }
          });
        };
        var searchParams = cleanUpSearchParams(volOppSearch.params);

        // jQuery.param properly handles complex objects (recursively); if we don't do this,
        // we end up with URLs like "proximity=[Object]"
        return CRM.$.param(searchParams);
      }

      volOppSearch.search = function() {
        clearResult();

        //Update the URL for bookmarkability
        $location.search(buildQueryString());

        // VOL-187: The beneficiary widget is an entityRef, so the value arrives as CSV rather than an array.
        if (volOppSearch.params.beneficiary && typeof volOppSearch.params.beneficiary === "string") {
          volOppSearch.params.beneficiary = volOppSearch.params.beneficiary.split(',');
        }

        // // don't show past opportunities -- obselete with flexible opportunities
        // if (!volOppSearch.params.date_start) {
        //   const now = moment();
        //   volOppSearch.params.date_start = now.format("YYYY-MM-DD HH:mm:ss");
        // }

        // no pagination, do not limit results
        volOppSearch.params.options = {
          limit: 0,
        };

        CRM.$('#crm-main-content-wrapper').block();

        return crmApi('VolunteerNeed', 'getsearchresult', volOppSearch.params).then(function(data) {

          result = data.values
          .map(function(need){
            // add schedule type into object
            need.schedule_type = 'unknown';
            if (need.start_time) {
              if (need.duration === '' || need.duration < 1) {
                need.schedule_type = 'open';
              } else if (!need.end_time) {
                need.schedule_type = 'shift';
              } else {
                need.schedule_type = 'flexible';
              }
            } else {
              console.warn('Need ' + need.id + ' has invalid times'); 
            }
            // add status into object
            need.status = '';
            if (need.quantity_assigned_current_user>0)
              need.status = 'registered';
            if (need.quantity_available<1)
              need.status = 'full';
            return need;
          });
          // // time / quantity constraints
          // .filter(function(need){
          //   const now = moment();
          //   const date_start = need.start_time && moment(need.start_time);
          //   return (
          //     // in future -- param to api only supports by day, not time
          //     (need.start_time && date_start.isAfter(now))
          //     // supported schedule types
          //     // (need.schedule_type === 'shift' || need.schedule_type === 'flexible')
          //     // // not full -- manage with class that way we can hide/show with css
          //     // && need.quantity_available>0
          //   );
          // });

          CRM.$('#crm-main-content-wrapper').unblock();

        },function(error) {
          callback([]);
          CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
          CRM.$('#crm-main-content-wrapper').unblock();
        });
      };

      //We are returning this as a function because there is a bug that causes
      //the 'result' to be unbound on the client side (eg, the listing is never refreshed)
      //this function acts as a closure and maintains binding
      volOppSearch.results = function results() { return result; };

      return volOppSearch;

    }])


    // Example: <div crm-vol-perm-to-class></div>
    // Adds a class to the element for each volunteer permission the user has.
    // This does not provide security but a better UX; i.e., don't show me
    // buttons I can't use.
    .directive('crmVolPermToClass', function(crmApi) {
      return {
        restrict: 'A',
        scope: {},
        link: function (scope, element, attrs) {
          var classes = [];
          crmApi('VolunteerUtil', 'getperms').then(function(perms) {
            angular.forEach(perms.values, function(value) {
              if (CRM.checkPerm(value.name) === true) {
                classes.push('crm-vol-perm-' + value.safe_name);
              }
            });

            $(element).addClass(classes.join(' '));
          });
        }
      };
    })


    // Example: <crm-vol-project-loc-block data="myLocObj" heading="'Location:'" />
    // Display a location block. In the example above, myLocObj should match the
    // format of an item in the values array of api.VolunteerProject.getlocblockdata.
    .directive('crmVolLocBlock', function() {
      return {
        restrict: 'E',
        controller: ['$scope', function($scope) {
          $scope.$watch('loc_block', function (newValue, oldValue, scope) {
           $scope.cntAddressParts = newValue.address ? Object.keys(newValue.address).filter(function(key){
             return newValue.address[key] !== null && newValue.address[key].length>0;
           }).length : 0;
          }, true);
        }],
        scope: {
          heading: '=?',
          loc_block: '=data'
        },
        templateUrl: '~/volunteer/shared/crmVolLocBlockView.html'
      };
    })

    // Example: <crm-vol-beneficiaries-block data="{beneficiaries: project.beneficiaries}" heading="'Beneficiaries'" />
    // Display a beneficiaries block.
    .directive('crmVolBeneficiariesBlock', function() {
      return {
        restrict: 'E',
        controller: function($scope){
          if ($scope.showImage === undefined)
            $scope.showImage = true;
        },
        scope: {
          heading: '=?',
          beneficiaries: '=',
          showImage: '=?',
        },
        templateUrl: '~/volunteer/shared/crmVolBeneficiariesView.html'
      };
    })


    // Example: <crm-vol-project-detail data="myProject" locBlockHeading="'Location:'" />
    // Provides a detail view for a volunteer project. locBlockHeading is passed
    // through to crmVolLocBlock for displaying a heading for the address.
    .directive('crmVolProjectDetail', function() {
      return {
        link: function(scope, element, attrs) {
          scope.ts = CRM.ts(null);
        },
        restrict: 'E',
        scope: {
          locBlockHeading: '=',
          project: '=data'
        },
        templateUrl: '~/volunteer/shared/crmVolProjectDetailView.html'
      };
    })


    // Example: <crm-vol-project-thumb data="myProject" />
    // Provides a thumbnail view for a volunteer project.
    .directive('crmVolProjectThumb', function() {
      return {
        restrict: 'E',
        scope: {
          project: '=data'
        },
        templateUrl: '~/volunteer/shared/crmVolProjectThumbView.html'
      };
    })


    // Example: <tr class="crm-vol-time-entry" ng-repeat="entry in myArray" ng-model="entry" />
    // Builds a table row with fields for updating time entries. In the example above,
    // entry should be in the format of a value from api.VolunteerAssignments.get.
    .directive('crmVolTimeEntry', function() {
      return {
        link: function(scope, element, attrs) {
          scope.ts = CRM.ts(null);

          // Remove a row when its button is clicked.
          element.find('button[crm-icon="fa-times"]').click(function () {
            var index = scope.$parent.$index;
            scope.$parent.$parent.ngModel.splice(index, 1);
            scope.$apply();
          });
        },
        replace: true,
        require: ['ngModel'],
        restrict: 'AC',
        scope: {
          ngModel: '='
        },
        templateUrl: '~/volunteer/shared/crmVolTimeEntryView.html'
      };
    })


    // Example: <crm-vol-time-table ng-form="myForm" ng-model="myArray" />
    // Builds a table for creating time entries. See crmVolTimeEntry.
    .directive('crmVolTimeTable', function() {
      return {
        link: function(scope, element, attrs) {
          scope.ts = CRM.ts(null);
        },
        require: ['ngModel'],
        restrict: 'E',
        scope: {
          ngModel: '='
        },
        templateUrl: '~/volunteer/shared/crmVolTimeTableView.html'
      };
    })


    /**
     * This is a service for loading the backbone-based volunteer UIs (and their
     * prerequisite scripts) into angular routes.
     */
    .factory('volBackbone', function(crmApi, crmProfiles, $q) {

      // This was done as a recursive function because the scripts must execute in order.
      function loadNextScript(scripts, callback, fail) {
        var script = scripts.shift();
        CRM.$.getScript(script)
          .done(function(scriptData, status) {
            if(scripts.length > 0) {
              loadNextScript(scripts, callback, fail);
            } else {
              callback();
            }
          }).fail(function(jqxhr, settings, exception) {
            console.log(exception);
            fail(exception);
          });
      }

      function loadSettings(settings) {
        CRM.$.extend(true, CRM, settings);
      }

      function loadStyleFile(url) {
        CRM.$("#backbone_resources").append('<link rel="stylesheet" type="text/css" href="' + url + '" />');
      }

      /**
       * Fetches a URL and puts the fetched HTML into #volunteer_backbone_templates.
       *
       * The intended use is to fetch a Smarty-generated page which contains all
       * of the backbone templates (e.g., <script type="text/template">foo</script>).
       */
      function loadTemplate(index, url) {
        var deferred = $q.defer();
        var divId = 'volunteer_backbone_template_' + index;

        CRM.$("#volunteer_backbone_templates").append("<div id='" + divId + "'></div>");
        CRM.$("#" + divId).load(CRM.url(url, {snippet: 5}), function(response) {
          deferred.resolve(response);
        });

        return deferred.promise;
      }

      function loadScripts(scripts) {
        var deferred = $q.defer();

        // What's this weird stuff going on with jQuery, you ask?
        //
        // Based on a discussion with totten, we anticipate problems with
        // competing versions of jQuery. On a given page, there are two copies
        // of jQuery (CMS's and CRM's), but only one of them includes Civi's
        // custom widgets and preferred add-ons (crmDatepicker, etc). jQuery
        // version problems wouldn't manifest all the time -- in many cases, the
        // different variants of jQuery are interchangeable, but we suspect that
        // certain directives (like crm-ui-datepicker) would fail in snippet
        // mode because they can't access a required jQuery function. So far
        // there don't seem to be any problems, but I'm flagging this as needing
        // more testing and as a potential source of mysterious problems.
        CRM.origJQuery = window.jQuery;
        window.jQuery = CRM.$;

        // We need to put underscore on the global scope or backbone fails to load
        if(!window._) {
          window._ = CRM._;
        }

        loadNextScript(scripts, function () {
          window.jQuery = CRM.origJQuery;
          delete CRM.origJQuery;
          CRM.volunteerBackboneScripts = true;
          deferred.resolve(true);
        }, function(status) {
          deferred.resolve(status);
        });

        return deferred.promise;
      }

      // TODO: Figure out a more authoritative way to check this, rather than
      // simply setting and checking a flag.
      function verifyScripts() {
        return Boolean(CRM.volunteerBackboneScripts);
      }
      function verifyTemplates() {
        return (angular.element("#volunteer_backbone_templates div").length > 0);
      }
      function verifySettings() {
        return Boolean(CRM.volunteerBackboneSettings);
      }

      return {
        verify: function() {
          return (Boolean(window.Backbone) && verifyScripts() && verifySettings() && verifyTemplates());
        },
        load: function() {
          var deferred = $q.defer();
          var promises = [];
          var preReqs = {};

          preReqs.volunteer = crmApi('VolunteerUtil', 'loadbackbone');

          if(!crmProfiles.verify()) {
            preReqs.profiles = crmProfiles.load();
          }

          $q.all(preReqs).then(function(resources) {

            if (CRM.$("#backbone_resources").length < 1) {
              CRM.$("body").append("<div id='backbone_resources'></div>");
            }

            if(CRM.$("#volunteer_backbone_templates").length < 1) {
              CRM.$("body").append("<div id='volunteer_backbone_templates'></div>");
            }

            // The settings must be loaded before the libraries
            // because the libraries depend on the settings.
            if(!verifySettings()) {
              loadSettings(resources.volunteer.values.settings);
              CRM.volunteerBackboneSettings = true;
            }

            if(!verifyScripts()) {
              promises.push(loadScripts(resources.volunteer.values.scripts));
            }

            if(!verifyTemplates()) {
              CRM.$.each(resources.volunteer.values.templates, function(index, url) {
                promises.push(loadTemplate(index, url));
              });
            }

            CRM.$.each(resources.volunteer.values.css, function(index, url) {
              loadStyleFile(url);
            });

            $q.all(promises).then(
              function () {
                //I'm not sure what normally triggers this event, but when cramming it
                //into angular the event isn't triggered. So I'm doing it here, otherwise
                //The backbone stuff fails.
                CRM.volunteerApp.trigger("initialize:before");

                deferred.resolve(true);
              },
              function () {
                console.log("Failed to load all backbone resources");
                deferred.reject(ts("Failed to load all backbone resources"));
              }
            );
          });
          return deferred.promise;
        }
      };
    });

})(angular, CRM.$, CRM._);
