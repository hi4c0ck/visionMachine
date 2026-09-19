// Composer UI — presentation layer.
//
// The composer ships a single 'current' layout: independent Keyframes /
// Subject Refs rows. The legacy 'fixed' variant (tabbed Keyframes⇄SubjectRefs
// aux panel + live drag-following frame pin) proved to offer no benefit, so
// the switch was retired along with its UI panel. This module exists so
// existing call sites that referenced the variant type keep type-checking.
//
