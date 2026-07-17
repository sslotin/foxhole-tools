// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Item from './Item.vue';

function mountItem(name, settings) {
  return mount(Item, {
    props: { name },
    global: {
      provide: {
        activeReport: { items: { [name]: { count: 1 } } }, // force display in every mode
        referenceReport: undefined,
        settings,
      },
    },
  });
}

function baseSettings(overrides = {}) {
  return { configure: false, warden: true, hiddenItems: [], targetShirts: 200, ...overrides };
}

function nameClasses(wrapper) {
  return wrapper.find('.name').classes();
}

describe('Item faction asterisk', () => {
  it('all items (configure): both warden and colonial items are marked', () => {
    const warden = mountItem('RifleW', baseSettings({ configure: true }));
    expect(nameClasses(warden)).toContain('warden');

    const collie = mountItem('RifleC', baseSettings({ configure: true }));
    expect(nameClasses(collie)).toContain('collie');
  });

  it('warden mode: only colonial items are marked', () => {
    const warden = mountItem('RifleW', baseSettings({ warden: true }));
    expect(nameClasses(warden)).not.toContain('warden');

    const collie = mountItem('RifleC', baseSettings({ warden: true }));
    expect(nameClasses(collie)).toContain('collie');
  });

  it('collie mode: only warden items are marked', () => {
    const warden = mountItem('RifleW', baseSettings({ warden: false }));
    expect(nameClasses(warden)).toContain('warden');

    const collie = mountItem('RifleC', baseSettings({ warden: false }));
    expect(nameClasses(collie)).not.toContain('collie');
  });
});