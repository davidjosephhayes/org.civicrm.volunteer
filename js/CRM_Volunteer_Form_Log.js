CRM.$(function($) {

  // Ability to bulk set all shifts to shecduled hours and mark as completed
  $('#bulkUpdate').click(function(){
    var $bulkUpdateStatus = $('.volunteer-log  [name*="bulkUpdateStatus"');
    var bulkUpdateStatus = $bulkUpdateStatus.val();
    $('.volunteer-log .crm-grid-row').each(function(){
      var $row = $(this);
      // set the duration
      var $actual_duration = $row.find('[name*="actual_duration"]');
      var actual_duration = $actual_duration.val();
      if (actual_duration.length===0) {
        var $scheduled_duration = $row.find('[name*="scheduled_duration"]');
        var scheduled_duration = $scheduled_duration.val();
        $actual_duration.val(scheduled_duration);
      }
      if (bulkUpdateStatus.length>0) {
        var $volunteer_status = $row.find('[name*="volunteer_status"]');
        $volunteer_status.val(bulkUpdateStatus);
      }
    });
  });

  // Ability to add a row
  $('#addMoreVolunteer').click(function(e){
    $('div.hiddenElement:first').show().removeClass('hiddenElement').addClass('crm-grid-row').css('display', 'table-row');
    e.preventDefault();
  });

  // Add ability to remove a row. Because "adding" just unhides the first hidden
  // row, it is more sensible to remove the row rather than clear and hide it.
  // Otherwise, the "added" row could show up anywhere in the table rather than
  // at the bottom as expected.
  $('.crm-vol-remove-row').click(function(e) {
    e.preventDefault();
    var row = $(this).closest('.crm-grid-row');
    // Animation is applied to children because elemnents with display:table don't slideUp.
    row.find('.crm-grid-cell').slideUp(100, function(){
      row.remove();
    });
  });
});
