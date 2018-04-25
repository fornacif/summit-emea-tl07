/*
 * ADOBE CONFIDENTIAL
 *
 * Copyright 2015 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */
(function(document, Coral, Granite, $, URITemplate) {
    "use strict";

    var registry = $(window).adaptTo("foundation-registry");

    // Delay used to show suggestions after the user interacted with the textfield
    var DELAY = 300;
    // Number of suggestions that will be shown
    var MAX_SUGGESTIONS = 9;
    // Minimum width of the typeahead input
    var INPUT_MIN_WIDTH = 200;
    // Predicate Id used to identify the location
    var LOCATION_PREDICATE_ID = "location";
    var LOCATION_SUGGESTION_PREDICATE_ID = "location.suggestion";

    // the omnisearch wrapper. it is an overlay on top of the whole page
    var omnisearch;
    // vent instance used to handle events inside the omnisearch
    var vent;
    // form used to handle the results loading. predicates will search and submit this form
    var form;
    // jquery version of the form
    var $form;
    // the wrapper of the typehead component
    var typeahead;
    // input used to hold the search
    var input;
    // taglist of the search predicates
    var tagList;
    // tagList tag holder used to avoid overflowing tags
    var tagListHolder;
    // tagList tag holder popover
    var tagListHolderPopover;
    // tagList tag holder popover list containing overflowing tags
    var tagListHolderList;
    // buttonList used to show the suggestions
    var buttonList;
    // overlay that holds the buttonList
    var overlay;
    // timeout used to debounce the user input
    var inputTimeout;
    // array that includes a flat navigation structure that can be used for suggestions
    var navigationData;
    // flag to display rail when the search result is displayed
    var showRail = false;
    // flag if the omnisearch is closable
    var closable = true;
    // The flag if the `closeOmnisearch()` is already called.
    // This is to avoid double calls in Chrome and Safari caused by two escape handlers at the input and global.
    // Other browsers only process the handler at the input.
    var closeIsCalled = false;

    // The omnisearch trigger element with configuration data
    var triggerElement;
    var searchUrl;
    var isDirty;
    var KEY_OMNISEARCH_PATH = "granite.shell.omnisearch.pathWhenOpeningOmnisearch";

    /**
     * @static
     */
    function substringMatcher(texts, query) {
        // Create a regex to match the the query
        // If multiple words are located in the string, it needs to match all of the them
        var substrRegex = new RegExp(query.split(" ").map(function(v) {
            return "(?=.*" + v + ")";
        }).join("") + ".+", "gi");

        return texts.filter(function(v) {
            return substrRegex.test(v.title);
        });
    }

    /**
     * The comparator to sort the suggestions.
     * It favors suggestions starting with the input
     * and works where the input is closer to the begining of the suggestions.
     * @param {Object} a First suggestion
     * @param {Object} b Second suggestion
     * @returns {Number} position
     */
    function suggestionSorter(a, b) {
        var refValue = input.value;

        // Move exact matches to the top
        if (refValue === a.suggestion) {
            return -1;
        }

        if (refValue === b.suggestion) {
            return 1;
        }

        var aIndex = a.suggestion.toLowerCase().indexOf(refValue.toLowerCase());
        var bIndex = b.suggestion.toLowerCase().indexOf(refValue.toLowerCase());

        // When the position is the same, prefer the shorter suggestions; use the position to order otherwise.
        return aIndex === bIndex ? -(b.suggestion.length - a.suggestion.length) : aIndex - bIndex;
    }

    /**
     * Scrolls to the bottom of the given item.
     * @static
     */
    function scrollItemIntoView(item, container) {
        var top;
        var position = $(item).position();

        if (position.top + item.offsetHeight >= container.offsetHeight) {
            top = item.offsetTop + item.offsetHeight - container.offsetHeight;
            container.scrollTop = top;
        } else if (position.top < 0) {
            // Scroll to the top of the item in this case
            top = item.offsetTop;
            container.scrollTop = top;
        }
    }

    /**
     * Adjust input's size to accommodate the tagList.
     */
    function updateInputSize() {
        // Wait until the element is ready to be able measure it
        Coral.commons.ready(tagList, function() {
            Coral.commons.nextFrame(function() {
                if (!input || !tagList) {
                    return;
                }

                var label = tagListHolder.label.querySelector(".granite-omnisearch-typeahead-tags-holder-label");

                if (input.clientWidth - tagList.offsetWidth <= INPUT_MIN_WIDTH) {
                    // Hide the last added visible tag

                    // eslint-disable-next-line max-len
                    var tag = tagList.querySelector("coral-tag:not([name='" + LOCATION_PREDICATE_ID + "']):not([hidden])");

                    if (tag) {
                        // Increment the counter
                        label.textContent = Number(label.textContent) + 1;

                        // Add an item that copies the tag label to the holder popover list
                        var item = tagListHolderList.items.add({
                            type: "button",
                            content: {
                                innerHTML: tag.label.innerHTML +
                                    // eslint-disable-next-line max-len
                                    "<coral-icon class='granite-omnisearch-typeahead-tags-holder-list-remove' icon='closeCircle' size='XS'></coral-icon>"
                            }
                        });

                        // Store the tag as reference
                        $(item).data("graniteOmnisearchTagsHolderItemTag", {
                            tag: tag,
                            width: tag.getBoundingClientRect().width
                        });

                        // Show the holder and hide the tag
                        tagListHolder.closable = false;
                        tagListHolder.hidden = false;
                        tag.hidden = true;
                    }
                } else {
                    var lastItem = tagListHolderList.items.last();
                    if (lastItem) {
                        var data = $(lastItem).data("graniteOmnisearchTagsHolderItemTag");

                        // If there's enough space, show the last hidden tag if any
                        if (data.tag.hidden) {
                            if (input.clientWidth - tagList.offsetWidth - data.width > INPUT_MIN_WIDTH) {
                                data.tag.hidden = false;
                                tagListHolderList.items.remove(lastItem);

                                if (!tagListHolderList.items.length) {
                                    tagListHolderPopover.open = false;
                                    tagListHolder.hidden = true;
                                    label.textContent = "";
                                } else {
                                    label.textContent = Number(label.textContent) - 1;
                                }
                            }
                        }
                    }

                    $(input).css("padding-left", tagList.offsetWidth);
                }
            });
        });
    }

    /**
     * Returns the position of the cursor of the given input.
     * @static
     * @param {HTMLElement} input
     * @returns {Number} position
     */
    function getCursorPosition(input) {
        if (!input) {
            return -1;
        } else if ("selectionStart" in input) {
            return input.selectionStart;
        } else if (document.selection) {
            // IE needs the item to be in focus
            if (document.activeElement !== input) {
                return -1;
            }
            var selection = document.selection.createRange();
            var selectionLength = selection.text.length;
            selection.moveStart("character", -input.value.length);
            return selection.text.length - selectionLength;
        }
    }

    /**
     * Closes the suggestion's overlay when a click is registered outside.
     * @param {Event} event
     */
    function onGlobalClick(event) {
        var eventTarget = event.target;

        var eventIsWithinTarget = input ? input.contains(eventTarget) : false;

        if (!eventIsWithinTarget && overlay !== null && overlay.open && !overlay.contains(eventTarget)) {
            hideSuggestions();
        }
    }

    function onTagListChange(event) {
        showSuggestions();
    }

    function onTagListRemoveItem(event) {
        updateInputSize();
        clearPredicate(event.detail.item);
    }

    function onTagListAddItem(event) {
        // Make sure tags aren't multiline
        event.detail.item.multiline = false;
        updateInputSize();
    }

    /**
     * Handles the holder counter and its items
     * @param {Event} event
     */
    function onTagListHolderRemoveItem(event) {
        var item = event.matchedTarget;

        var label = tagListHolder.label.querySelector(".granite-omnisearch-typeahead-tags-holder-label");

        if (tagListHolderList.items.length === 1) {
            // The last item is going to be removed so the holder can be hidden again
            tagListHolderPopover.open = false;
            tagListHolder.hidden = true;
            label.textContent = "";
        } else {
            label.textContent = Number(label.textContent) - 1;
        }

        tagListHolderList.items.remove(item);

        // Remove the related tag
        tagList.items.remove($(item).data("graniteOmnisearchTagsHolderItemTag").tag);
    }

    /**
     * Handles the keydown event in the input.
     * @param {Event} event
     */
    function onTextfieldKeydown(event) {
        var preventDefault = true;

        var target;
        var items;
        var index;
        var $item;

        switch (event.keyCode) {
            // backspace: Delete tag
            case 8:
                // Allow the cursor to delete as normal
                preventDefault = false;

                if (getCursorPosition(input) === 0 && window.getSelection().toString() === "") {
                    // Remove the last item since it is the closest to the cursor
                    var last = tagList.items.last();
                    if (last) {
                        last.remove();
                    }

                    // Tag changes always update suggestions, but not triggering search
                    showSuggestions();
                }
                break;
            // tab: Create a new predicate without triggering search
            case 9:
                if (overlay.open) {
                    target = buttonList.querySelector("[coral-list-item].is-focused");

                    if (target && target.dataset.graniteOmnisearchTypeaheadSuggestionPredicateid) {
                        // As a productivity boost, allow the users to select the tag without refreshing the results
                        createPredicateTag(target);
                        showSuggestions();
                        break;
                    }
                } else {
                    // If the overlay is not open, allow tabbing to get out of the component
                    preventDefault = false;
                }
                break;
            // enter: Select the item and perform the search
            case 13:
                if (overlay.open) {
                    target = buttonList.querySelector("[coral-list-item].is-focused");

                    if (target) {
                        // This click will create the tag and trigger the search
                        target.click();
                        break;
                    }
                }

                loadSearchResults();
                break;
            case 38:
                if (overlay.open) {
                    // Allow the cursor to move as expected
                    preventDefault = false;

                    target = buttonList.querySelector("[coral-list-item].is-focused");
                    items = buttonList._getSelectableItems();
                    index = items.indexOf(target);

                    $(target).removeClass("is-focused");

                    if (items.length === 0) {
                        return;
                    }

                    if (index > 0) {
                        $item = $(items[index - 1]);
                        $item.addClass("is-focused");
                    } else {
                        $item = $(items[items.length - 1]);
                        $item.addClass("is-focused");
                    }

                    scrollItemIntoView($item[0], overlay);
                }
                break;
            // down: Move through the overlay or show suggestions
            case 40:
                if (overlay.open) {
                    // Allow the cursor to move as expected
                    preventDefault = false;

                    target = buttonList.querySelector("[coral-list-item].is-focused");
                    items = buttonList._getSelectableItems();
                    index = items.indexOf(target);

                    $(target).removeClass("is-focused");

                    if (items.length === 0) {
                        return;
                    }

                    if (index < items.length - 1) {
                        $item = $(items[index + 1]);
                        $item.addClass("is-focused");
                    } else {
                        $item = $(items[0]);
                        $item.addClass("is-focused");
                    }

                    scrollItemIntoView($item[0], overlay);
                } else {
                    // Show the menu and do not focus on the first item
                    showSuggestions();
                }
                break;
            default:
                preventDefault = false;
        }

        if (preventDefault) {
            event.preventDefault();
        }
    }

    function onTextfieldInput(event) {
        // Debounce user input before showing suggestions
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(showSuggestions, DELAY);
    }

    function onSuggestionClick(event) {
        var target = event.matchedTarget;

        if (typeof target.dataset.graniteOmnisearchTypeaheadNavigation !== "undefined") {
            // Navigation is ignored
            return;
        } else if (target.dataset.graniteOmnisearchTypeaheadSuggestionPredicateid) {
            // If the item is annotated, create a tag with it
            createPredicateTag(target);
        } else {
        		// Otherwise, set the text as the entry
        		if (target.spellcheckSuggestion) {
                input.value = target.spellcheckSuggestion;
            } else {
                input.value = target.value || target.content.textContent;
            }        
        }

        loadSearchResults();
    }

    function hideSuggestions() {
        clearTimeout(inputTimeout);

        // Make sure that the overlay is ready
        Coral.commons.ready(overlay, function() {
            overlay.hide();
        });
    }

    function showSuggestions() {
        if (!typeahead) {
            return;
        }

        // Get value from the input
        var inputValue = input.value;

        // if there is not enough text to search we must close the overlay
        if (inputValue.length < 3) {
            hideSuggestions();
            return;
        }

        var url = URITemplate.expand(typeahead.dataset.graniteOmnisearchTypeaheadSrc, {
            query: $form.serialize()
        });

        if (url) {
            $.get(url, function(data) {
                if (!typeahead) {
                    return;
                }
                // since we are showing fresh suggestions, clear the existing suggestions
                buttonList.items.clear();

                // element to be added to the list
                var element;
                // creates a regex that handles multiple words
                var escapedInput = inputValue.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
                var regex = new RegExp("(" + escapedInput.split(" ").join("|") + ")", "gi");
                // handles the navigation suggestions
                var matches = substringMatcher(navigationData || [], escapedInput);

                var itemsAddedCount = 0;

                // navigation suggestions
                // navigation suggestions are only shown when no tags are chosen
                // adapted max suggestions reserves at least 1 entry for a predicate when predicates are present
                // eslint-disable-next-line max-len
                var ADAPTED_MAX_SUGGESTIONS = (data.predicateSuggestions && data.predicateSuggestions.length > 0) ? MAX_SUGGESTIONS - 1 : MAX_SUGGESTIONS;
                if (matches) {
                    matches.some(function(item, index) {
                        element = new Coral.AnchorList.Item().set({
                            icon: item.icon,
                            href: Granite.HTTP.externalize(item.href),
                            content: {
                                innerHTML: "<span class='granite-omnisearch-typeahead-suggestions-tip'>" +
                                    Granite.I18n.get("Press Enter to navigate") +
                                    "</span>" +
                                    Granite.I18n.get("Go to") + " " +
                                    item.title.replace(regex, "<span class='u-coral-text-secondary'>$1</span>")
                            }
                        });
                        element.setAttribute("data-granite-omnisearch-typeahead-navigation", "");
                        buttonList.items.add(element);

                        return ++itemsAddedCount >= ADAPTED_MAX_SUGGESTIONS;
                    });
                }

                // predicate suggestions
                if (itemsAddedCount < MAX_SUGGESTIONS && data.predicateSuggestions) {
                    data.predicateSuggestions.some(function(item, index) {
                        element = new Coral.ButtonList.Item().set({
                            type: "button",
                            content: {
                                innerHTML: "<span class='granite-omnisearch-typeahead-suggestions-tip'>" +
                                Granite.I18n.get("Press Tab to add") +
                                "</span>" +
                                "<coral-tag size='M'>" +
                                "<span class='u-coral-text-capitalize u-coral-text-secondary u-coral-text-italic'>" +
                                item.type +
                                ": </span>" +
                                item.value.replace(regex, "<span class='u-coral-text-secondary'>$1</span>") +
                                "</coral-tag>"
                            }
                        });

                        // type and value should come translated from the server
                        // @todo: we need to define a predicateId, the location predicate doesn't contain a typePath
                        var predicateId = item.typePath ||
                            item.queryParameters.location !== "" ? LOCATION_PREDICATE_ID : item.type;
                        element.setAttribute("data-granite-omnisearch-typeahead-suggestion-predicateid", predicateId);
                        element.setAttribute("data-granite-omnisearch-typeahead-suggestion-tag", item.type);
                        element.setAttribute("data-granite-omnisearch-typeahead-suggestion-value", item.value);
                        // eslint-disable-next-line max-len
                        $(element).data("granite-omnisearch-typeahead-suggestion-queryparameters", item.queryParameters);

                        buttonList.items.add(element);

                        return ++itemsAddedCount >= MAX_SUGGESTIONS;
                    });
                }

                // text suggestions
                if (itemsAddedCount < MAX_SUGGESTIONS && data.suggestions) {
                    // since they are not sorted in the server we sort and remove duplicates in the client
                    data.suggestions = data.suggestions.sort(suggestionSorter).filter(function(item, pos, array) {
                        return !pos || item.suggestion !== array[pos - 1].suggestion;
                    });

                    data.suggestions.some(function(item, index) {
                        var sanitizedValue =  $("<div>").text(item.suggestion).html();
                        buttonList.items.add({
                            value: item.value,
                            content: {
                                innerHTML: sanitizedValue.replace(regex, "<span class='u-coral-text-secondary'>$1</span>") // eslint-disable-line max-len
                            }
                        });

                        return ++itemsAddedCount >= MAX_SUGGESTIONS;
                    });
                } else  if (itemsAddedCount < MAX_SUGGESTIONS && data.spellcheckSuggestion) {
                		data.spellcheckSuggestion.some(function(item, index) {
                        buttonList.items.add({
                            value: item,
                            content: {
                                innerHTML: "<span class='u-coral-text-secondary'>Do you mean: " + item + "</span>"
                            }
                        });

                        return ++itemsAddedCount >= MAX_SUGGESTIONS;
                    });
                }

                // resets the height to be able to measure properly
                buttonList.style.height = "";

                // measures actual height of the buttonList
                var style = window.getComputedStyle(buttonList);
                var height = parseInt(style.height, 10);
                var maxHeight = parseInt(style.maxHeight, 10);

                if (height < maxHeight) {
                    // makes it scrollable
                    buttonList.style.height = height + "px";
                }

                if (itemsAddedCount > 0) {
                    overlay.open = true;
                }
            });
        }
    }

    function createPredicateTag(item) {
        if (!item.dataset.graniteOmnisearchTypeaheadSuggestionPredicateid) {
            return;
        }

        if (!item.dataset.graniteOmnisearchTypeaheadSuggestionKeepinput) {
            // we need to clear the input since it now became a tag
            input.value = "";
        }

        updatePredicate(item, $(item).data("granite-omnisearch-typeahead-suggestion-queryparameters"));
    }

    /**
     * @static
     */
    function focusInput(input) {
        if (input) {
            setTimeout(function() {
                input.focus();
            }, 100);
        }
    }

    function clearPredicate(item) {
        $form.trigger({
            type: "granite-omnisearch-predicate-clear",
            detail: {
                item: item,
                tagList: tagList
            }
        });
    }

    function updatePredicate(item, queryParams) {
        $form.trigger({
            type: "granite-omnisearch-predicate-update",
            detail: {
                item: item,
                tagList: tagList,
                queryParameters: queryParams
            }
        });
    }

    function getOmnisearchOverlay() {
        return document.querySelector(".granite-omnisearch-overlay");
    }

    /**
     * Update the complete search content and location in the browser history
     * @param {HTMLFormElement} [form] - The omnisearch form element.
     * @param {Object} [location] - The omnisearch location.
     */
    function updateHistoryState(form, location) {
        var state = History.getState();

        if (!state.data.omnisearch) {
            state.data.omnisearch = {};
        }
        if (form) {
            state.data.omnisearch.formData = $(form).serializeArray();
            History.replaceState(state.data, state.title);
        }
        if (location) {
            state.data.omnisearch.location = location;
            History.replaceState(state.data, state.title);
        }
    }

    /**
     * Restores the search state based on the given form data.
     *
     * @param {Array} formData The serialized form data
     */
    function restoreSearch(formData) {
        var queryParams = formData.reduce(function(memo, v) {
            memo[v.name] = v.value;
            return memo;
        }, {});

        updatePredicate(undefined, queryParams);
        loadSearchResults();
    }

    /**
     * Opens the omnisearch.
     *
     * @param {Object} [historyConfig] The history config.
     *                                 When it is passed, the search state is restored based on it.
     *                                 Otherwise, a new history state is pushed.
     * @returns {Promise} The promise when it is done
     */
    function openOmnisearch(historyConfig) {
        // If the overlay is already open, do nothing
        if (omnisearch) {
            focusInput(input);
            return $.when();
        }

        if (!triggerElement) {
            return $.Deferred().reject().promise();
        }

        var url = triggerElement.dataset.graniteOmnisearchSrc;

        if (!url) {
            return $.Deferred().reject().promise();
        }

        var location;
        if (historyConfig) {
            location = historyConfig.location;
        } else {
            var locationEl = document.head.querySelector(".granite-omnisearch-location");
            if (locationEl) {
                location = {
                    label: locationEl.dataset.graniteOmnisearchLocationLabel,
                    value: locationEl.dataset.graniteOmnisearchLocationValue
                };
            }
        }

        return $.get(url).then(function(data) {
            $(document.body)
                .append(data)
                .trigger("foundation-contentloaded");

            omnisearch = getOmnisearchOverlay();

            // Make sure it is the topmost layer
            $(omnisearch).css("zIndex", document.querySelector("coral-shell-header").style.zIndex + 10);

            // Cache the internal elements for performance
            form = omnisearch.querySelector(".granite-omnisearch-form");
            typeahead = form.querySelector(".granite-omnisearch-typeahead");
            input = typeahead.querySelector(".granite-omnisearch-typeahead-input");
            tagList = typeahead.querySelector(".granite-omnisearch-typeahead-tags");
            tagListHolder = typeahead.querySelector(".granite-omnisearch-typeahead-tags-holder");
            tagListHolderPopover = omnisearch.querySelector(".granite-omnisearch-typeahead-tags-holder-popover");
            tagListHolderList = tagListHolderPopover.querySelector(".granite-omnisearch-typeahead-tags-holder-list");
            buttonList = typeahead.querySelector(".granite-omnisearch-typeahead-suggestions");
            overlay = typeahead.querySelector(".granite-omnisearch-typeahead-overlay");

            /* global Vent:false */
            vent = new Vent(omnisearch);
            $form = $(form);

            $form.on("submit", function() {
                updateHistoryState(this);
            });

            vent.on("input", ".granite-omnisearch-typeahead-input", onTextfieldInput);
            vent.on("keydown", ".granite-omnisearch-typeahead-input", onTextfieldKeydown);
            vent.on("coral-collection:add", ".granite-omnisearch-typeahead-tags", onTagListAddItem);
            vent.on("coral-collection:remove", ".granite-omnisearch-typeahead-tags", onTagListRemoveItem);
            vent.on("change", ".granite-omnisearch-typeahead-tags", onTagListChange);
            vent.on("click", ".granite-omnisearch-typeahead-overlay [coral-list-item]", onSuggestionClick);
            // eslint-disable-next-line max-len
            vent.on("click", ".granite-omnisearch-typeahead-tags-holder-list [coral-list-item]", onTagListHolderRemoveItem);
            window.addEventListener("resize", updateInputSize);

            // This is required to detect when tags label are modified (e.g. the path predicate)
            Coral.commons.addResizeListener(tagList, updateInputSize);

            // handles clicking outside the suggestions overlay
            document.addEventListener("click", onGlobalClick);

            if (!closable) {
                typeahead.querySelector(".granite-omnisearch-typeahead-close").hidden = true;
            }

            if (!navigationData) {
                navigationData = [];
                var navSrc = omnisearch.dataset.graniteOmnisearchOverlayNavsrc;

                $.get(navSrc, function(data) {
                    navigationData = parseNavigationData(data);
                });
            }

            focusInput(input);

            var locationPredicatePromise = $.when();

            if (location && location.value && location.label) {
                locationPredicatePromise = setLocationPredicate(location.value, location.label);
            }

            return locationPredicatePromise.then(function() {
                if (historyConfig) {
                    if (historyConfig.formData) {
                        restoreSearch(historyConfig.formData);
                    }
                } else {
                    if (!window.location.pathname.startsWith(searchUrl)) {
                        window.sessionStorage.setItem(KEY_OMNISEARCH_PATH, window.location.pathname);
                    }

                    History.pushState({
                        omnisearch: {
                            referrer: true,
                            location: location
                        }
                    }, Granite.I18n.get("AEM Search"), searchUrl);
                }
            });
        });
    }

    function closeOmnisearch() {
        if (closable && !closeIsCalled) {
            closeIsCalled = true;
            if (isDirty) {
                // We restore the original path before omnisearch is opened
                // This is needed cause the navigation is not linear. E.g. when navigating from
                // a search result to the details, then press cancel, a new state is created with search/html as
                // path. Navigating then back when closing is wrong, cause then we navigate back to the details and
                // not to the original state before opening omnisearch
                var originalPathBeforeOpeningOmnisearch = window.sessionStorage.getItem(KEY_OMNISEARCH_PATH);
                History.pushState({
                }, null, originalPathBeforeOpeningOmnisearch);
            } else {
                History.back();
            }
        }
    }

    function actuallyCloseOmnisearch() {
        vent.destroy();
        document.removeEventListener("click", onGlobalClick);
        window.removeEventListener("resize", updateInputSize);

        $(omnisearch).remove();

        // Reset variables
        omnisearch = vent = typeahead = input = null;
        tagList = tagListHolder = tagListHolderList = tagListHolderPopover = null;
        buttonList = overlay = form = $form = null;
        showRail = false;
        closable = true;
        closeIsCalled = false;
    }

    function updatePredicatePanel(location) {
        if (location) {
            var src = omnisearch.dataset.graniteOmnisearchOverlayPredicatesrc;

            if (!src) {
                return $.Deferred().reject().promise();
            }

            var url = URITemplate.expand(src, {
                location: location
            });

            return $.ajax({
                url: url,
                cache: false
            }).then(function(data) {
                var parser = $(window).adaptTo("foundation-util-htmlparser");

                return parser.parse(data).then(function(fragment) {
                    var $el = $(fragment).children();
                    var $newRail = $el.filter("#granite-omnisearch-result-rail");

                    $newRail
                        .replaceAll($("#granite-omnisearch-result-rail", omnisearch))
                        .trigger("foundation-contentloaded");

                    if (showRail) {
                        var railToggle = omnisearch.querySelector("#granite-omnisearch-result-rail-toggle");
                        if (railToggle) {
                            // If the toggle element already exists then select the item.
                            // Otherwise, it means that form response comes later.
                            // Show the rail at the form response handler then.
                            railToggle.items.getAll()[1].selected = true;
                            showRail = false; // Reset to initial value as the job is done
                        }
                    }
                });
            });
        } else {
            $("#granite-omnisearch-result-rail-toggle", omnisearch).remove();

            var $rail = $("#granite-omnisearch-result-rail", omnisearch);
            var toggleableAPI = $rail.adaptTo("foundation-toggleable");
            toggleableAPI.hide();

            $rail.empty();
            tagList.items.clear();

            return $.Deferred().reject().promise();
        }
    }

    /**
     * @static
     */
    function parseNavigationData(data, parent) {
        return Object.keys(data).reduce(function(acc, value) {
            var navItem = data[value];
            if (navItem.href && navItem.title) {
                acc.push({
                    title: parent ? parent + " › " + navItem.title : navItem.title,
                    href: navItem.href,
                    icon: navItem.icon
                });
            } else if (typeof navItem === "object") {
                acc = acc.concat(parseNavigationData(navItem, parent ? parent + " › " + navItem.title : navItem.title));
            }
            return acc;
        }, []);
    }

    function loadSearchResults() {
        // Close the suggestion to make the results visible
        hideSuggestions();
        $form.submit();
        isDirty = true;
    }

    registry.register("foundation.form.response.ui.success", {
        name: "granite.omnisearch.result",
        handler: function(form, config, data, textStatus, xhr, parsedResponse) {
            var parser = $(window).adaptTo("foundation-util-htmlparser");

            parser.parse(parsedResponse).then(function(fragment) {
                var $el = $(fragment).children();

                var $content = $(".granite-omnisearch-content", omnisearch)
                    .prop("hidden", false);

                var $resultContent = $content.find("#granite-omnisearch-result-content");

                $resultContent.find("[data-foundation-layout]").each(function() {
                    Granite.UI.Foundation.Layouts.cleanAll(this);
                });

                var $actionbar = $content.find("#granite-omnisearch-result-actionbar");
                var $newActionbar = $el.filter("#granite-omnisearch-result-actionbar");
                if ($actionbar.length) {
                    var $railToggle = $actionbar.find("#granite-omnisearch-result-rail-toggle");
                    if ($railToggle.length) {
                        $actionbar.children("betty-titlebar-secondary")
                            .replaceWith($newActionbar.children("betty-titlebar-secondary"));
                    } else {
                        $actionbar.replaceWith($newActionbar);
                    }
                } else {
                    $content.find("#granite-omnisearch-result-header").append($newActionbar);
                }

                var $selectionbar = $content.children("#granite-shell-search-result-selectionbar");
                var $newSelectionbar = $el.filter("#granite-shell-search-result-selectionbar");
                if ($selectionbar.length) {
                    $selectionbar.replaceWith($newSelectionbar);
                } else {
                    $content.append($newSelectionbar);
                }

                $resultContent.replaceWith($el.filter("#granite-omnisearch-result-content"));

                $content.trigger("foundation-contentloaded");

                var railToggle = $content.find("#granite-omnisearch-result-rail-toggle")[0];
                if (railToggle) {
                    Coral.commons.ready(railToggle, function() {
                        if (showRail) {
                            var secondItem = railToggle.items.getAll()[1];
                            var target = secondItem.dataset.graniteToggleableControlTarget;
                            if ($(target).length) {
                                // If target element already exists then select the item.
                                // Otherwise, it means that rail response comes later.
                                // Show the rail at the rail response handler then.
                                secondItem.selected = true;
                                showRail = false; // Reset to initial value as the job is done
                            }
                        }
                    });
                }
            });
        }
    });

    // quickactions are never shown on multiresults view
    $(document).on("coral-overlay:beforeopen", ".granite-omnisearch-multiresult-row coral-quickactions", function(e) {
        e.preventDefault();
    });

    $(document).on("click", ".granite-omnisearch-viewall-button", function(event) {
        event.preventDefault();

        var button = event.currentTarget;

        if (button.dataset.graniteOmnisearchTypeaheadSuggestionPredicateid) {
            updatePredicate(button, JSON.parse(button.dataset.graniteOmnisearchTypeaheadSuggestionQueryparameters));
            loadSearchResults();
        }
    });

    // Set the view cookie
    $(document).on("foundation-layout-perform", function(e) {
        if (e.target.id === "granite-omnisearch-result") {
            var layout = $(e.target);
            var config = layout.data("foundationLayout");

            $.cookie("shell.omnisearch.results.layoutId", config.layoutId, { path: "/" });
        }
    });

    $(document).on("granite-omnisearch-predicate-clear", function(event) {
        var form = event.target;
        var item = event.detail.item;

        if (event.detail.reset) {
            event.detail.tagList.items.getAll().forEach(function(tagEl) {
                if (tagEl.id !== "granite-omnisearch-field-locationtag") {
                    $(tagEl).remove();
                }
            });

            input.value = "";
        }

        if (!item || item.id !== "granite-omnisearch-field-locationtag") {
            return;
        }

        // Update location information
        $("#granite-omnisearch-field-location", form).remove();
        $("#granite-omnisearch-field-location-suggestion", form).remove();
        $(item).remove();
        // And clean it in History
        updateHistoryState(undefined, {});

        updatePredicatePanel();
    });

    // location: update
    $(document).on("granite-omnisearch-predicate-update", function(event) {
        var item = event.detail.item;

        if (item && item.dataset.graniteOmnisearchTypeaheadSuggestionPredicateid !== LOCATION_PREDICATE_ID) {
            return;
        }

        var queryParams = event.detail.queryParameters;
        var location = queryParams[LOCATION_PREDICATE_ID];
        var locationSuggestion = queryParams[LOCATION_SUGGESTION_PREDICATE_ID];

        if (!location) {
            return;
        }

        setLocationPredicate(location, locationSuggestion, item, true);
    });

    function setLocationPredicate(location, locationSuggestion, item, replaceState) {
        var locationInput = form.querySelector("#granite-omnisearch-field-location");

        if (locationInput && locationInput.value === location) {
            return $.when();
        }

        var tagName;
        var tagText;

        if (item) {
            tagName = item.dataset.graniteOmnisearchTypeaheadSuggestionTag;
            tagText = item.dataset.graniteOmnisearchTypeaheadSuggestionValue;
        } else {
            tagName = Granite.I18n.get("Location");
            tagText = locationSuggestion;
        }

        var locationSuggestionInput = form.querySelector("#granite-omnisearch-field-location-suggestion");
        var locationTag = tagList.querySelector("#granite-omnisearch-field-locationtag");

        if (locationInput === null) {
            locationInput = document.createElement("input");
            locationInput.id = "granite-omnisearch-field-location";
            locationInput.type = "hidden";
            locationInput.name = LOCATION_PREDICATE_ID;

            form.appendChild(locationInput);
        }

        if (locationSuggestionInput === null) {
            locationSuggestionInput = document.createElement("input");
            locationSuggestionInput.id = "granite-omnisearch-field-location-suggestion";
            locationSuggestionInput.type = "hidden";
            locationSuggestionInput.name = LOCATION_SUGGESTION_PREDICATE_ID;

            form.appendChild(locationSuggestionInput);
        }

        if (locationTag === null) {
            locationTag = new Coral.Tag();
            locationTag.id = "granite-omnisearch-field-locationtag";

            Coral.commons.ready(tagList, function() {
                tagList.items.add(locationTag);
            });
        }

        locationInput.value = location;
        locationSuggestionInput.value = tagText;

        $(locationTag.label)
            .empty()
            .append($(document.createElement("span"))
                .addClass("u-coral-text-capitalize u-coral-text-italic u-coral-text-secondary")
                .text(tagName + ": "))
            .append($(document.createElement("span")).text(tagText));

        if (replaceState) {
            updateHistoryState(undefined, {
                value: location,
                label: tagText
            });
        }

        return updatePredicatePanel(location);
    }

    // fulltext: update
    $(document).on("granite-omnisearch-predicate-update", function(event) {
        var queryParams = event.detail.queryParameters;

        // "fulltext" or "2_fulltext"
        var key = Object.keys(queryParams).find(function(key) {
            var parts = key.split("_");
            return (parts.length === 1 && parts[0] === "fulltext") || (parts.length === 2 && parts[1] === "fulltext");
        });

        if (key) {
            input.value = queryParams[key];
        }
    });


    //-----------------
    // History
    //-----------------

    $(window).on("statechange", function() {
        var state = History.getState();

        var config = state.data.omnisearch;

        if (config) {
            if (!omnisearch) {
                openOmnisearch(config);
            }
        } else if (omnisearch) {
            // When /aem/search.html is a standalone page (e.g. due to a browser reload at some point),
            // it has `meta[name='granite.omnisearch.searchpage']`.
            // In that case, when navigating back from /aem/search.html (i.e. this code block),
            // the previous content needs to be reloaded as it is empty otherwise.
            var meta = document.head.querySelector("meta[name='granite.omnisearch.searchpage']");
            if (meta && meta.content === "true") {
                window.location.reload();
            } else {
                actuallyCloseOmnisearch();
            }
        }
    });


    //-----------------
    // Entry points
    //-----------------

    $(function() {
        triggerElement = document.querySelector(".granite-omnisearch-src");
        if (triggerElement) {
            searchUrl = triggerElement.dataset.graniteOmnisearchSearchUrl;

            if (window.location.pathname.startsWith(searchUrl)) {
                var config = History.getState().data.omnisearch;

                // When the config is not there, pass empty one to prevent pushing a new state,
                // since the page URL is already the search URL.
                closable = config && config.referrer;
                openOmnisearch(config || {});
            }
        }
    });

    $(document).on("click", "#granite-omnisearch-trigger", function(event) {
        event.preventDefault();
        openOmnisearch();
    });

    $(document).on("click", ".granite-omnisearch-typeahead-close", function(event) {
        event.preventDefault();
        closeOmnisearch();
    });

    // Open omnisearch and trigger a search when Filters cyclebutton is clicked.
    // When opening, add path predicate based on the current path of the collection.
    $(document).on("coral-cyclebutton:change", "#granite-shell-actionbar .granite-toggleable-control", function(event) {
        var selectedEl = event.originalEvent.detail.selection;
        var collectionSelector = selectedEl.dataset.graniteOmnisearchFilter;

        if (!collectionSelector) {
            return;
        }

        var currentPath = $(collectionSelector).attr("data-foundation-collection-id");
        showRail = true;

        openOmnisearch().then(function() {
            updatePredicate(undefined, {
                "_path": currentPath
            });
            loadSearchResults();
        });
    });

    Coral.keys.on("escape", function(event) {
        if (!omnisearch || !omnisearch._isTopOverlay()) {
            return;
        }

        if (overlay && overlay.open) {
            event.preventDefault();
            hideSuggestions();
        } else if (!$("#granite-omnisearch-result .foundation-collection-item.foundation-selections-item").length) {
            event.preventDefault();
            closeOmnisearch();
        }
    });

    if ($(window).adaptTo("foundation-preference").getBoolean("shortcutsEnabled", true)) {
        // Register the KB shortcut for search
        document.addEventListener("keypress", function(event) {
            if (!Coral.Keys.filterInputs(event)) {
                return;
            }

            // Open with "/" only
            var character = event.key || String.fromCharCode(event.which || event.keyCode);
            if (character !== "/") {
                return;
            }

            // If "/" is pressed on the predicate ui field abort
            if (typeahead && typeahead.contains(document.activeElement)) {
                return;
            }

            // If selectionbar is visible we don't open omnisearch
            if ($(".granite-collection-selectionbar > .foundation-mode-switcher-item-active").length) {
                return;
            }

            event.preventDefault();
            openOmnisearch();
        });
    }
})(document, Coral, Granite, Granite.$, Granite.URITemplate);
