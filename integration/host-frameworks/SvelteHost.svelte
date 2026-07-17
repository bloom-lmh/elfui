<script>
  import { contractProps, eventProbe, listItems, visible } from "./svelte-state";
</script>

{#if $visible}
  <form>
    <elf-host-contract
      textValue={$contractProps.textValue}
      countValue={$contractProps.countValue}
      active={$contractProps.active}
      config={$contractProps.config}
      items={$contractProps.items}
      handler={$contractProps.handler}
      name="elfValue"
      style:--contract-accent="rgb(12, 34, 56)"
      oncontract-single={eventProbe.onSingle}
      oncontract-multiple={eventProbe.onMultiple}
      oncontract-cancelable={eventProbe.onCancelable}
    >
      <span slot="label">Svelte label</span>
      <span>Svelte default</span>
    </elf-host-contract>
  </form>
{/if}

<section data-host-list>
  {#each $listItems as item (item.id)}
    <elf-host-contract data-list-id={item.id} textValue={item.label}></elf-host-contract>
  {/each}
</section>
