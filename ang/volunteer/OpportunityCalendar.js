(function (angular, $, _) {

  angular.module('volunteer').config(function ($routeProvider) {
    $routeProvider.when('/volunteer/opportunitycalendar', {
      controller: 'OpportunityCalendar',
      // update the search params in the URL without reloading the route     
      templateUrl: '~/volunteer/OpportunityCalendar.html',
      resolve: {
      },
    });
  });

  angular.module('volunteer').controller('OpportunityCalendar', function ($route, $scope, crmApi, $window, $location, uiCalendarConfig) {

    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    
    $scope.search = "";
    $scope.totalRec;

    //Change reult view
    $scope.goToAppeals=function(view) {
      view = view || 'grid';
      $location.path("/volunteer/appeals/" + view);
    };

    //reset page count and search data
    $scope.searchRes = function(){
      console.log($scope.search, uiCalendarConfig.calendars.opportunities);
      uiCalendarConfig.calendars.opportunities.fullCalendar('refetchEvents');
    }

    $scope.volSignup = function(need_flexi_id) {
      $window.location.href =CRM.url("civicrm/volunteer/signup", "reset=1&needs[]="+need_flexi_id+"&dest=list");
    }

    
    // config object for calendar
    $scope.uiConfig = {
      calendar:{
        height: 650,
        header:{
          left: 'month agendaWeek agendaDay', //  basicWeek basicDay 
          center: 'title',
          right: 'today prev,next'
        },
        eventClick: function(calEvent, jsEvent, view) {
          // console.log(calEvent);
          $scope.volSignup(calEvent.id);
        },
      }
    };
    $scope.calendarSources = [];
    $scope.calendarEvents = [
      function(start, end, timezone, callback) {

        CRM.$('#crm-main-content-wrapper').block();

        // const currentView = $scope.calendar.fullCalendar('getView').type;
        const now = moment();

        const params = {
          sequential: 1,
          visibility_id: 1,
          is_active: 1,
          date_start: now.isBefore(start) ? start.format("YYYY-MM-DD HH:mm:ss") : now.format("YYYY-MM-DD HH:mm:ss"),
          date_end: end.format("YYYY-MM-DD HH:mm:ss"),
          options: {
            limit: 0,
          },
        };

        crmApi('VolunteerNeed', 'getsearchresult', params)
        .then(function(data){

          $scope.calendarSources = data.values;

          const events = data.values
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
            return need;
          })
          // time / quantity constraints
          .filter(function(need){
            const now = moment();
            const date_start = need.start_time && moment(need.start_time);
            return (
              // in future -- param to api only supports by day, now time
              (need.start_time && date_start.isAfter(now)) &&
              // supported schedulte types
              (need.schedule_type === 'shift' || need.schedule_type === 'flexible') &&
              // not full
              need.quantity_available>0
            );
          }).
          filter(function(need){

          })
          .map(function(need){
            const start = moment(need.start_time);
            const eventSource = {
              id: need.id,
              title: need.role_label.trim() + ' (' + need.project.title.trim() + ')',
              start: start,
              need: need,
            };
            if (need.end_time) {
              eventSource.end = moment(need.end_time);
            } else if (need.duration) {
              eventSource.end = start.clone().add(need.duration, 'minute');
            } else {
             // shouldn't get here
             console.warn('Need ' + need.id + ' has invalid times'); 
            }
            return eventSource;
          });
          
          console.log({events});
          callback(events);

          CRM.$('#crm-main-content-wrapper').unblock();

        },function(error) {
          callback([]);
          CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
          CRM.$('#crm-main-content-wrapper').unblock();
        }); 
      },
    ];

  });

})(angular, CRM.$, CRM._);