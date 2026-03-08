TEST_DIR=preview/_/js/tests

.PHONY: test
test:
	node --test $$(find $(TEST_DIR) -name '*.test.js')
