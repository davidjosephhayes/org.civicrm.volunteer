<div class="crm-block crm-volunteer-profile-form-block">

  <div class="crm-vol-opp-search">
    <div class="crm-block ui-tabs ui-widget ui-widget-content ui-corner-all">
      <div class="crm-group">
        <div class="welcome-contact">
          <h2>{ts}Welcome{/ts} {$contact.first_name}!</h2>
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
    <div class="crm-volunteer-profile-stats">
      <table>
        <caption>{ts}My Contributions{/ts}</caption>
        <thead>
          <th></th>
          <th scope="col">{ts}This Week{/ts}</th>
          <th scope="col">{ts}This Month{/ts}</th>
          <th scope="col">{ts}This Year{/ts}</th>
          <th scope="col">{ts}All Time{/ts}</th>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Hours</th>
            <td>
              {assign var="week_to_date" value=$stats.week_to_date/60}
              {$week_to_date|number_format:1}
            </td>
            <td>
              {assign var="month_to_date" value=$stats.month_to_date/60}
              {$month_to_date|number_format:1}
            </td>
            <td>
              {assign var="year_to_date" value=$stats.year_to_date/60}
              {$year_to_date|number_format:1}
            </td>
            <td>
              {assign var="all_time" value=$stats.all_time/60}
              {$all_time|number_format:1}
            </td>
          </tr>
          <tr>
            <th scope="row">Points Earned</th>
            <td>{$stats.weighted_week_to_date|number_format:0}</td>
            <td>{$stats.weighted_month_to_date|number_format:0}</td>
            <td>{$stats.weighted_year_to_date|number_format:0}</td>
            <td>{$stats.weighted_all_time|number_format:0}</td>
          </tr>
        </tbody>
      </table>
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
