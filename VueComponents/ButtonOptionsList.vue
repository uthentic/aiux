<script setup>

import { ref, computed, defineProps, defineModel, defineEmits, defineExpose} from 'vue';

const props = defineProps({
    multiple: {
        type: String,
        default: "false"
    },
    busy: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits([
    'select'
]);

/**
 * @typedef {Object} Bullet
 * @property {string} text
 * @property {Bullet[]} children
 */
const options = defineModel();
const selections = ref([]);
const selected = computed(() => props.multiple === 'true' ? selections.value : selections.value[0]);

function select(option) {
    option = getOption(option);

    if(props.multiple === 'true')
    {
        if(selections.value.includes(option))
            selections.value = selections.value.filter(x => x !== option);
        else
            selections.value.push(option);
    }
    else
    {
        if(selections.value.includes(option))
            selections.value = [];
        else
            selections.value = [option];
    }

    console.log("selected", selected.value);

    emit('select', selected.value);
}

function isSelected(option) {
    option = getOption(option);

    return selections.value.includes(option);
}

const isObject = computed(() => options.value && typeof options.value === 'object' && options.value.constructor === Object);
const optionNames = computed(() => {
    if(isObject.value)
        return Object.keys(options.value);

    if(!options.value?.length)
        return [];

    return options.value.map(x => x.text || x);
});

function getOption(option) {
    if(isObject.value)
        return options.value[option];

    return option;
}

defineExpose({
    select,
    selected
});

</script>

<template>
    <div v-if="optionNames.length">
        <sl-button size="small" v-for="option in optionNames" @click="select(option)" :variant="isSelected(option) ? 'primary' : 'default'">{{ option }}</sl-button>
        <sl-spinner v-if="busy"></sl-spinner>
    </div>
</template>

<style scoped>
    sl-button
    {
        margin-right: var(--sl-spacing-x-small);
        margin-bottom: var(--sl-spacing-x-small);
    }
</style>
