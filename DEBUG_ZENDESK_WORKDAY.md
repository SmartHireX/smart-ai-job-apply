# Debug Guide: Zendesk Workday Form

**URL**: https://zendesk.wd1.myworkdayjobs.com/en-US/zendesk/job/Pune%2C-India/Senior-Software-Engineer--Backend-_R33978/apply?source=LinkedIn

## Investigation Steps

### Step 1: Check Platform Detection

Open the form and run in console:

```javascript
// Check if Workday is detected
WorkdayAdapter.detect()
// Expected: true

PlatformAdapterFactory.getPlatformName()
// Expected: "workday"
```

### Step 2: Inspect Form Structure

```javascript
// Enable debug mode
WorkdayAdapter.DEBUG = true;
PlatformAdapterFactory.DEBUG = true;

// Find all inputs
const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea, select');
console.log('Total inputs found:', inputs.length);

// Test label extraction on each input
inputs.forEach((input, index) => {
    const label = WorkdayAdapter.extractLabel(input);
    console.log(`Field ${index}:`, {
        id: input.id,
        name: input.name,
        automationId: input.getAttribute('data-automation-id'),
        extractedLabel: label,
        actualLabel: 'CHECK VISUALLY IN FORM'
    });
});
```

### Step 3: Analyze Specific Field Issues

For each field that's not working:

```javascript
// Replace with actual field selector
const problematicInput = document.querySelector('input[data-automation-id="firstName"]');

console.log('Field Details:', {
    element: problematicInput,
    id: problematicInput?.id,
    name: problematicInput?.name,
    automationId: problematicInput?.getAttribute('data-automation-id'),
    ariaLabel: problematicInput?.getAttribute('aria-label'),
    ariaLabelledBy: problematicInput?.getAttribute('aria-labelledby')
});

// Check parent structure
console.log('Parent structure:', {
    parent: problematicInput?.parentElement,
    grandparent: problematicInput?.parentElement?.parentElement,
    fieldset: problematicInput?.closest('fieldset'),
    formField: problematicInput?.closest('[data-automation-id*="formField"]')
});

// Check for richText
const richTexts = document.querySelectorAll('[data-automation-id="richText"]');
console.log('All richText elements:', richTexts.length);
richTexts.forEach((rt, i) => {
    console.log(`RichText ${i}:`, rt.textContent.trim());
});

// Try manual extraction
const manualLabel = WorkdayAdapter.extractLabel(problematicInput);
console.log('Manual extraction result:', manualLabel);
```

### Step 4: Check for Workday-Specific Patterns

```javascript
// Check for common Workday patterns
console.log('Workday DOM Patterns:', {
    hasRichText: document.querySelectorAll('[data-automation-id="richText"]').length > 0,
    hasWidgetType: document.querySelectorAll('[data-uxi-widget-type]').length > 0,
    hasPromptOption: document.querySelectorAll('[data-automation-id*="promptOption"]').length > 0,
    hasRadioGroup: document.querySelectorAll('[role="radiogroup"]').length > 0,
    hasSpinbutton: document.querySelectorAll('[role="spinbutton"]').length > 0
});

// Check for fieldsets
const fieldsets = document.querySelectorAll('fieldset');
console.log('Fieldsets found:', fieldsets.length);
fieldsets.forEach((fs, i) => {
    const legend = fs.querySelector('legend');
    const richText = legend?.querySelector('[data-automation-id="richText"]');
    console.log(`Fieldset ${i}:`, {
        legend: legend?.textContent.trim(),
        richText: richText?.textContent.trim(),
        inputs: fs.querySelectorAll('input').length
    });
});
```

## Common Issues & Solutions

### Issue 1: Fields with No richText

**Symptom**: Input has no associated `[data-automation-id="richText"]`

**Debug**:
```javascript
const input = document.querySelector('input[type="text"]'); // First text input
console.log('Has richText parent?', input.closest('[data-automation-id*="label"]')?.querySelector('[data-automation-id="richText"]'));
```

**Solution**: Check for alternative label patterns:
- `aria-label` directly on input
- Label in sibling `<div>`
- Label in `data-automation-id` pattern

### Issue 2: Nested Fieldsets

**Symptom**: Fieldset legend not being detected

**Debug**:
```javascript
const input = document.querySelector('input[type="radio"]');
const fieldset = input.closest('fieldset');
console.log('Fieldset:', {
    exists: !!fieldset,
    legend: fieldset?.querySelector('legend')?.textContent,
    nestedFieldsets: fieldset?.querySelectorAll('fieldset').length
});
```

**Solution**: Check for nested fieldsets and use closest one

### Issue 3: Dynamic Field IDs

**Symptom**: Field IDs change on page reload

**Debug**:
```javascript
const input = document.querySelector('input[type="text"]');
console.log('ID pattern:', {
    id: input.id,
    isDynamic: /\d{5,}/.test(input.id),
    automationId: input.getAttribute('data-automation-id'),
    name: input.name
});
```

**Solution**: Use `data-automation-id` instead of `id`

### Issue 4: Custom Workday Widgets

**Symptom**: Button-based dropdowns not detected

**Debug**:
```javascript
const buttons = document.querySelectorAll('button[data-automation-id*="promptOption"]');
console.log('Custom dropdowns:', buttons.length);
buttons.forEach((btn, i) => {
    console.log(`Dropdown ${i}:`, {
        automationId: btn.getAttribute('data-automation-id'),
        ariaControls: btn.getAttribute('aria-controls'),
        currentValue: btn.textContent.trim()
    });
});
```

**Solution**: Add button dropdown detection

## Specific Fixes Needed

Based on the investigation above, document specific patterns found in this Zendesk Workday form:

### Pattern 1: [DOCUMENT HERE]
```html
<!-- Paste actual DOM structure from console -->
```

**Fix**: [Describe what needs to be changed in WorkdayAdapter]

### Pattern 2: [DOCUMENT HERE]
```html
<!-- Paste actual DOM structure -->
```

**Fix**: [Describe fix]

## Test After Fixes

```javascript
// Reload extension
// Clear cache
PlatformAdapterFactory.clearCache();

// Test each field
const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');
inputs.forEach((input, i) => {
    const label = PlatformAdapterFactory.extractLabel(input);
    console.log(`Field ${i}: ${label}`);
});

// Verify all labels are correct
```

## Report Template

After investigation, fill this in:

```
FIELD DETECTION ISSUES ON ZENDESK WORKDAY FORM
===============================================

URL: https://zendesk.wd1.myworkdayjobs.com/...

ISSUE 1: [Field Name]
- Expected Label: [What it should be]
- Actual Label: [What adapter returns]
- DOM Structure: [Paste relevant HTML]
- Root Cause: [Why extraction fails]
- Fix Needed: [What to change in adapter]

ISSUE 2: [Field Name]
...

OVERALL PATTERN:
[Describe common pattern across all failing fields]

RECOMMENDED FIX:
[Specific changes to WorkdayAdapter.extractLabel()]
```

---

**Next Steps**: Run the debugging commands above and document the findings.
