<div class="crm-block crm-volunteer-profile-form-block">

  <div class="crm-vol-opp-search">
    <div class="crm-block ui-tabs ui-widget ui-widget-content ui-corner-all">
      <div class="crm-group">
        <div class="welcome-contact">
          <h2>Welcome {$contact.first_name}!</h2>
        </div>
        <div class="search-display">
          <a class="grid_view_button grid_active button"><i class="fa fa-user"></i></a>
          <a class="grid_view_button button" href="{crmURL p='civicrm/vol/#/volunteer/assignments/list'}"><i class="fa fa-bars"></i></a>
          <a class="grid_view_button button" href="{crmURL p='civicrm/vol/#/volunteer/assignments/calendar'}"><i class="fa fa-calendar"></i></a>
        </div>
      </div>
    </div>
  </div>

  <div class="crm-volunteer-profile-summary">
    <div class="crm-volunteer-profile-image">
      {if !empty($contact.image_URL) and !($contact.image_URL eq '/')}
				<img src="{$contact.image_URL}" alt="Contact Profile" />
			{else}
				-- no image --
			{/if}
    </div>
  </div>

  {if !empty($customProfiles)}
    <div class="crm-volunteer-profile-profiles">
      {foreach from=$customProfiles key=ufID item=ufFields }
        {include file="CRM/UF/Form/Block.tpl" fields=$ufFields}
      {/foreach}
    </div>

    <div class="crm-submit-buttons">
      {include file="CRM/common/formButtons.tpl" location="bottom"}
    </div>
  {/if}

</div>

{include file="CRM/common/notifications.tpl" location="bottom"}
