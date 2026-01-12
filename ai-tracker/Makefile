.PHONY: build publish clean

build:
	rm -rf dist
	uv build

publish: build
	uv publish --token $(PYPI_TOKEN)

clean:
	rm -rf dist *.egg-info
