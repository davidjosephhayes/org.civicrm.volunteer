<div class="crm-block crm-volunteer-profile-form-block">

  <div class="crm-volunteer-profile-summary">
    
  </div>

  <div class="crm-volunteer-profile-profiles">
    {foreach from=$customProfiles key=ufID item=ufFields }
      {include file="CRM/UF/Form/Block.tpl" fields=$ufFields}
    {/foreach}
  </div>

  <div class="crm-submit-buttons">
    {include file="CRM/common/formButtons.tpl" location="bottom"}
  </div>
</div>

{include file="CRM/common/notifications.tpl" location="bottom"}
