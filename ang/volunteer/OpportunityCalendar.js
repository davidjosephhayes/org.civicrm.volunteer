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

  angular.module('volunteer').controller('OpportunityCalendar', function ($route, $scope, crmApi, $window, $location, volunteerCalendarConfig) {

    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    
    $scope.search = "";
    $scope.totalRec;

    //Change reult view
    $scope.goToAppeals=function(view) {
      view = view || 'grid';
      $location.path("/volunteer/appeals/" + view);
    };

    //reset page count and search data
    $scope.resetSearch = function(){
      $scope.search = "";
      $scope.searchRes();
    };
    $scope.searchRes = function(){
      volunteerCalendarConfig.calendars.opportunities.fullCalendar('refetchEvents');
    };

    $scope.volSignup = function(need_flexi_id) {
      $window.location.href =CRM.url("civicrm/volunteer/signup", "reset=1&needs[]="+need_flexi_id+"&dest=calendar");
    };

    // config object for calendar
    $scope.uiConfig = {
      calendar:{
        height: 750,
        header:{
          left: 'month agendaWeek agendaDay', //  basicWeek basicDay 
          center: 'title',
          right: 'today prev,next'
        },
        eventClick: function(calEvent, jsEvent, view) {
          if (calEvent.className.includes('fc-registered')) {
            CRM.alert(ts('You are already registered for this opportunity.'), ts("Good news!"));
            return;
          }
          if (calEvent.className.includes('fc-full')) {
            if (calEvent.need.quantity_available<1) {
              CRM.alert(ts('Unfortunately this opportunity is full.'), ts("Oh no!"));
            } else {
              CRM.alert(ts('Unfortunately this opportunity is unavailable currently.'), ts("Oh no!"));
            }
            return;
          }
          $scope.volSignup(calEvent.id);
        },
        viewRender: function(currentView){
          const minDate = moment();
          // maxDate = moment().add(2,'weeks');
          // Past
          if (minDate >= currentView.start && minDate <= currentView.end) {
            $(".fc-prev-button").prop('disabled', true); 
            $(".fc-prev-button").addClass('fc-state-disabled'); 
          } else {
            $(".fc-prev-button").removeClass('fc-state-disabled'); 
            $(".fc-prev-button").prop('disabled', false); 
          }
          // // Future
          // if (maxDate >= currentView.start && maxDate <= currentView.end) {
          //   $(".fc-next-button").prop('disabled', true); 
          //   $(".fc-next-button").addClass('fc-state-disabled'); 
          // } else {
          //   $(".fc-next-button").removeClass('fc-state-disabled'); 
          //   $(".fc-next-button").prop('disabled', false); 
          // }
        },
        eventAfterAllRender: function(view){
          let totalRec = 0;
          const events = volunteerCalendarConfig.calendars.opportunities.fullCalendar('clientEvents');
          events.forEach(function(event){
            if (
              (view.start.isSameOrBefore(event.start, 'day') && view.end.isAfter(event.start, 'day')) ||
              (view.start.isBefore(event.end, 'day') && view.end.isSameOrAfter(event.end, 'day'))
              ) {
              totalRec++;
            }
          });
          $scope.totalRec = totalRec;
        },
      },
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

        if ($scope.search)
          params.search = $scope.search;

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
              // in future -- param to api only supports by day, not time
              (need.start_time && date_start.isAfter(now)) &&
              // supported schedule types
              (need.schedule_type === 'shift' || need.schedule_type === 'flexible')
              // // not full -- manage with class that way we can hide/show with css
              // && need.quantity_available>0
            );
          })
          .map(function(need){
            const start = moment(need.start_time);
            const classNames = [];
            if (need.quantity_assigned_current_user>0)
              classNames.push('fc-registered');
            if (need.quantity_available<1)
              classNames.push('fc-full');
            const eventSource = {
              id: need.id,
              title: need.role_label.trim() + ' (' + need.project.title.trim() + ')',
              start: start,
              className: classNames.length>0 ? classNames.join(' ') : 'fc-available',
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

          // $scope.totalRec = events.length;
          
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